// ========================================================================
// Edge Function: bia-vendas-proalt
// ========================================================================
// BIA — agente de vendas do ProAlt no WhatsApp (API oficial via Unichat).
// Doc canônico: docs/AGENTE-BIA-VENDAS-PROALT.md
// Scripts de objeção: docs/BIA-SCRIPTS-OBJECOES.md
// Schema: schema-038 (bia_leads, bia_conversas, bia_mensagens, bia_followups,
// bia_config).
//
// Entrada (Unichat bloco HTTP request, ou teste direto):
//   {
//     telefone: "+55 11 99999-8888"   (obrigatório — qualquer formato BR)
//     nome?: "Fulano"
//     mensagem?: "texto do lead"
//     midia_url?: "https://..."       (áudio ou imagem que o lead mandou)
//     midia_tipo?: "audio" | "imagem" (se ausente, inferido pela extensão/content-type)
//     evento?: "mensagem" (default) | "clique_me_conta_mais"
//            | "chama_mais_tarde" | "parar_avisos"
//     teste?: true                    (marca lead de teste — origem 'teste')
//   }
//   Áudio → transcrito (whisper-1) e tratado como texto do lead.
//   Imagem → entra como visão multimodal (a Bia "vê" — ex.: comprovante de
//   pagamento dispara pós-venda; print de erro no checkout ela orienta).
//
// Saída:
//   { ok, mensagens: string[], resposta, etapa, lead_estado, anexos: string[] }
//   mensagens = bolhas curtas de WhatsApp (o modelo separa com "|||").
//
// Auth: x-internal-token (service role) OU Bearer service_role/JWT
//       OU x-bia-token === cofre BIA_UNICHAT_TOKEN (pro fluxo da Unichat).
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';
import { chamarLLM, logarCustoFinOps, calcularCustoUSD } from '../_shared/agente.ts';
import { getChave } from '../_shared/cofre.ts';
import { soDigitos, variantesTelefoneBR, orTelefonePostgrest } from '../_shared/telefone-br.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MODELO = 'openai:gpt-5.5';
const MAX_TOOL_ROUNDS = 4;
const HISTORICO_MAX_MSGS = 40;
const CEREBRO_PROALT_ID = '864e6f53-ce6e-4710-901c-72ba09128260';

// DEBOUNCE (agrupamento de mensagens): a pessoa costuma mandar a pergunta em
// várias frases. Em vez de responder cada uma, espera o lead PARAR de digitar
// e responde uma vez só à mensagem completa. Editável via bia_config
// ('debounce_segundos'; 0 desliga).
const DEBOUNCE_SEG_DEFAULT = 12;    // silêncio necessário pra processar
const DEBOUNCE_PASSO_MS = 1500;     // granularidade da checagem

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
}

// ========================================================================
// Telefone: normaliza pra dígitos com DDI 55 (chave única de bia_leads)
// ========================================================================
function telefoneCanonico(input: string): string | null {
  let d = soDigitos(input || '');
  if (!d) return null;
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (!d.startsWith('55')) d = '55' + d;
  // 55 + DDD(2) + 8~9 dígitos
  if (d.length < 12 || d.length > 13) return null;
  return d;
}

// ========================================================================
// TRAVA DE SEGURANÇA: lead já comprou o ProAlt?
// Fonte da verdade: Supabase do APP ProAlt (profiles + user_plans), que o
// webhook Hotmart alimenta em tempo real — pega compra por QUALQUER canal
// (link da Bia, link do evento, comercial), não só as com sck=bia-agente.
// Checado a CADA mensagem antes de vender (regra Andre 2026-08-22).
// ========================================================================
const PROALT_APP_REST = 'https://vdrlvflludyqkyhfoiwb.supabase.co/rest/v1';
const PLANO_FULL_PROALT = '2cf21005-9c84-4c60-8566-782809edc41b';

async function verificarCompraProAlt(telefone: string, email: string | null): Promise<boolean> {
  try {
    const key = await getChave('PROALT_SERVICE_ROLE_KEY', 'bia-vendas-proalt');
    if (!key) return false;
    const headers = { 'apikey': key, 'Authorization': `Bearer ${key}` };

    // 1. Acha profiles por telefone (variantes BR — fronteira nossa) e/ou email
    const variantes = variantesTelefoneBR(telefone);
    const filtros: string[] = [];
    if (variantes.length) filtros.push(orTelefonePostgrest('phone', variantes));
    if (email) filtros.push(`email=eq.${encodeURIComponent(email.toLowerCase())}`);

    const userIds = new Set<string>();
    for (const filtro of filtros) {
      const r = await fetch(`${PROALT_APP_REST}/profiles?select=user_id&${filtro}&limit=10`, { headers });
      if (!r.ok) continue;
      for (const p of await r.json()) if (p.user_id) userIds.add(p.user_id);
    }
    if (userIds.size === 0) return false;

    // 2. Algum deles tem o plano FULL ativo?
    const ids = [...userIds].join(',');
    const r2 = await fetch(
      `${PROALT_APP_REST}/user_plans?select=user_id,plan_id&user_id=in.(${ids})&plan_id=eq.${PLANO_FULL_PROALT}&limit=1`,
      { headers },
    );
    if (!r2.ok) return false;
    const planos = await r2.json();
    return planos.length > 0;
  } catch (e) {
    // Falha na checagem NUNCA derruba a conversa — só loga (fail-open pro
    // diálogo, mas o guardrail "já comprei" do prompt segue de rede)
    console.warn('[bia] verificarCompraProAlt falhou:', String(e?.message || e));
    return false;
  }
}

// ========================================================================
// Mídia do lead: áudio → transcrição whisper · imagem → base64 pra visão
// ========================================================================
const EXT_AUDIO_RX = /\.(mp3|ogg|opus|m4a|wav|webm|aac)(\?|$)/i;
const EXT_IMG_RX = /\.(png|jpe?g|webp|gif)(\?|$)/i;

async function baixarMidia(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`download mídia ${resp.status}`);
  const contentType = resp.headers.get('content-type') || '';
  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (bytes.length > 20 * 1024 * 1024) throw new Error('mídia acima de 20MB');
  return { bytes, contentType };
}

function inferirTipoMidia(url: string, contentType: string, declarado?: string): 'audio' | 'imagem' | null {
  if (declarado === 'audio' || declarado === 'imagem') return declarado;
  if (contentType.startsWith('audio/') || EXT_AUDIO_RX.test(url)) return 'audio';
  if (contentType.startsWith('image/') || EXT_IMG_RX.test(url)) return 'imagem';
  return null;
}

async function transcreverAudio(bytes: Uint8Array, contentType: string): Promise<string> {
  const KEY = await getChave('OPENAI_API_KEY', 'bia-vendas-proalt');
  const ext = contentType.includes('ogg') ? 'ogg' : contentType.includes('mp4') || contentType.includes('m4a') ? 'm4a' : contentType.includes('wav') ? 'wav' : contentType.includes('webm') ? 'webm' : 'mp3';
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: contentType || 'audio/mpeg' }), `audio.${ext}`);
  form.append('model', 'whisper-1');
  form.append('language', 'pt');
  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}` },
    body: form,
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `whisper ${resp.status}`);
  return (data.text || '').trim();
}

function bytesParaDataUrl(bytes: Uint8Array, contentType: string): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${contentType || 'image/jpeg'};base64,${btoa(bin)}`;
}

// ========================================================================
// Guardrail determinístico: opt-out em texto livre (antes de gastar LLM)
// ========================================================================
function ehOptoutTexto(msg: string): boolean {
  const t = (msg || '').toLowerCase();
  return /\b(para|pare|parar) de (me )?(mandar|enviar)|n[aã]o quero (mais )?(receber|mensagem|papo)|me (tira|remove|exclui) (da|dessa) lista|descadastr|sair da lista|stop\b/
    .test(t);
}

// ========================================================================
// Tools do modelo
// ========================================================================
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'buscar_cerebro',
      description:
        'Busca no cérebro do ProAlt (aulas, pitch comercial, funcionalidades do app, pesquisas). ' +
        'Use quando precisar de detalhe que você não tem: conteúdo de módulo, funcionalidade específica ' +
        'do app, argumento do pitch, dado do método. NÃO use pra preço/garantia/checkout — isso você já tem fixo.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'pergunta em português natural' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_depoimento',
      description:
        'Busca depoimentos reais de alunos do ProAlt, COM LINK da imagem/print quando houver (é link público, você PODE mandar pro lead). ' +
        'SEMPRE devolve algo (nunca volta vazio). Use quando: o lead pergunta se funciona pro caso dele, quer prova, ou pra quebrar objeção de confiança. ' +
        'Passe o NICHO e/ou o TIPO DE PRODUTO do lead (ex: "template pra professoras", "curso de brigadeiro", "ebook de dieta") — a busca casa por nicho, depois por tipo de produto, e no pior caso traz os cases mais fortes.',
      parameters: {
        type: 'object',
        properties: { tema: { type: 'string', description: 'nicho + tipo de produto do lead (ex: "template aulas professoras", "curso confeitaria brigadeiro", "ebook dieta emagrecimento")' } },
        required: ['tema'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'acionar_humano',
      description:
        'Transfere DEFINITIVAMENTE pro time humano. Use quando: lead pede humano e insiste, ' +
        'lead irritado/hostil, lead exige falar com pessoa pra comprar, ou situação fora do seu alcance. ' +
        'Depois disso você NUNCA mais responde este lead.',
      parameters: {
        type: 'object',
        properties: { motivo: { type: 'string' } },
        required: ['motivo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'registrar_desfecho',
      description:
        'Registra o desfecho da conversa. Use: comprou_antes (lead já é aluno), ' +
        'desqualificado (sem perfil — liberou com dignidade), optout (pediu pra parar em texto), ' +
        'venda_sinalizada (lead disse que vai comprar / mandou comprovante).',
      parameters: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['comprou_antes', 'desqualificado', 'optout', 'venda_sinalizada'] },
          detalhe: { type: 'string' },
        },
        required: ['tipo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'atualizar_etapa',
      description:
        'Atualiza a etapa do funil da conversa quando ela avança. Etapas: reconexao → diagnostico → ' +
        'oferta → prova_social → objecoes → fechamento → pos. Chame sempre que mudar de etapa.',
      parameters: {
        type: 'object',
        properties: {
          etapa: { type: 'string', enum: ['reconexao', 'diagnostico', 'oferta', 'prova_social', 'objecoes', 'fechamento', 'pos'] },
        },
        required: ['etapa'],
      },
    },
  },
];

// ========================================================================
// Executor de tools
// ========================================================================
async function executarTool(
  nome: string,
  args: any,
  ctx: { leadId: string; conversaId: string; config: Record<string, string>; anexos: string[] },
): Promise<string> {
  try {
    switch (nome) {
      case 'buscar_cerebro': {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/buscar-cerebro`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ cerebro_id: CEREBRO_PROALT_ID, query: args.query, top_k: 6 }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `buscar-cerebro ${resp.status}`);
        return JSON.stringify({
          chunks: (data.resultados || []).map((r: any) => ({
            titulo: r.titulo,
            conteudo: r.conteudo?.slice(0, 500),
          })),
        });
      }
      case 'buscar_depoimento': {
        // Busca em CAMADAS (malícia): tenta casar por nicho/produto do lead, mas
        // NUNCA volta de mãos vazias. Se não achar o nicho exato, cai pra tipo de
        // produto (template, curso, ebook...) e por fim pros cases mais fortes.
        // A imagem do print é link PÚBLICO do Storage → a Bia manda o link e a
        // pessoa vê a prova real (a Unichat entrega em `anexos`).
        const { data: deps } = await sb()
          .from('cerebro_fontes')
          .select('id, autor, conteudo_md, metadata, url')
          .eq('cerebro_id', CEREBRO_PROALT_ID)
          .eq('tipo', 'depoimento')
          .limit(50);

        const tema = (args.tema || '').toLowerCase();
        // termos do nicho/produto do lead (>=4 letras) + sinônimos de "tipo de produto"
        const termos = tema.split(/\s+/).filter((p: string) => p.length >= 4);
        const TIPOS_PRODUTO = ['template', 'curso', 'ebook', 'e-book', 'planilha', 'aula', 'mentoria', 'guia', 'pdf', 'receita', 'apostila'];
        const tiposNoTema = TIPOS_PRODUTO.filter(t => tema.includes(t));

        const scored = (deps || []).map((d: any) => {
          const txt = ((d.conteudo_md || '') + ' ' + JSON.stringify(d.metadata || {})).toLowerCase();
          let score = 0;
          // nicho/produto exato do lead pesa mais
          score += termos.reduce((s: number, p: string) => s + (txt.includes(p) ? 3 : 0), 0);
          // tipo de produto (template/curso/ebook) pesa médio
          score += tiposNoTema.reduce((s: number, t: string) => s + (txt.includes(t) ? 2 : 0), 0);
          // ter imagem/print e ter número/resultado dá um empurrão (converte mais)
          const temImg = !!(d.metadata?.anexo_principal_url);
          if (temImg) score += 1;
          if (/\b(mil|k\b|r\$|\d{2,})/.test(txt)) score += 1;
          return { d, score, temImg };
        });

        // Ordena por score; empate → quem tem imagem primeiro
        scored.sort((a: any, b: any) => (b.score - a.score) || (Number(b.temImg) - Number(a.temImg)));

        // Camada 1: casou algo do nicho/produto (score alto)? pega esses.
        // Camada 2 (fallback): nada casou → devolve os cases mais fortes MESMO ASSIM,
        // priorizando os que têm imagem (nunca "não achei").
        const casou = scored.filter((x: any) => x.score >= 2).slice(0, 2);
        const base = casou.length ? casou : scored.slice(0, 2);

        // Extrai o autor REAL do texto quando o campo autor é nulo
        // (formato do md: "**Aluno:** Fulano").
        function autorReal(d: any): string {
          if (d.autor) return d.autor;
          if (d.metadata?.autor) return d.metadata.autor;
          const m = (d.conteudo_md || '').match(/Aluno:\*{0,2}\s*([^\n*]+)/i);
          return (m?.[1] || '').trim() || 'um aluno do ProAlt';
        }

        const itens = base.map(({ d }: any) => {
          const anexo = d.metadata?.anexo_principal_url || null;
          return {
            autor: autorReal(d),
            resumo: d.metadata?.resumo || null,
            texto: (d.conteudo_md || '').replace(/\*\*/g, '').slice(0, 400),
            // link SEMPRE amarrado a ESTE autor; se não tem, deixa explícito.
            print_deste_autor: anexo,
            sem_print: !anexo,
          };
        });

        return JSON.stringify({
          depoimentos: itens,
          casou_nicho: casou.length > 0,
          REGRA_CRITICA:
            'Cada depoimento tem (ou não) o print_deste_autor DELE. É PROIBIDO mandar o print de um autor falando de outro autor. ' +
            'Se você vai citar o Fulano, só cole um link se o print_deste_autor do Fulano existir. ' +
            'Se o depoimento que você quer citar tem sem_print=true, cite o relato em texto e NÃO mande link nenhum (nem o de outra pessoa). ' +
            'Prefira citar UM depoimento que tenha print (mais forte) e mande o print_deste_autor DELE, verbalizando: "olha o print do [autor]: [print_deste_autor]".',
          instrucao: casou.length
            ? 'Achei case(s) relacionado(s). Escolha UM, cite autor + resultado, e mande o print SÓ se for o print_deste_autor dele.'
            : 'NÃO achei case do nicho exato. NUNCA diga "não temos do seu nicho". Diga que tem de situação parecida e cite um. Print, só o print_deste_autor de quem você citar.',
        });
      }
      case 'acionar_humano': {
        await sb().from('bia_leads').update({ estado: 'humano', atualizado_em: new Date().toISOString() }).eq('id', ctx.leadId);
        await sb().from('bia_conversas').update({ aberta: false, resultado: 'humano', atualizado_em: new Date().toISOString() }).eq('id', ctx.conversaId);
        await sb().from('bia_followups').update({ status: 'cancelado' }).eq('lead_id', ctx.leadId).eq('status', 'pendente');
        await sb().from('bia_mensagens').insert({ conversa_id: ctx.conversaId, papel: 'sistema', conteudo: `[handoff humano] ${args.motivo || ''}` });
        const karen = ctx.config['contato_karen'];
        return JSON.stringify({
          ok: true,
          instrucao: 'Confirme a transferência em UMA mensagem curta e calorosa e encerre. Você não responde mais este lead.',
          contato_humano: karen && karen !== 'PENDENTE' ? karen : null,
        });
      }
      case 'registrar_desfecho': {
        const mapa: Record<string, { lead?: string; conversa?: string; fecha: boolean }> = {
          comprou_antes: { lead: 'comprou_antes', fecha: true },
          desqualificado: { conversa: 'perdido', fecha: true },
          optout: { lead: 'optout', conversa: 'optout', fecha: true },
          // venda sinalizada: lead vira 'comprou' (auto-declarado; a trava do app
          // confirma depois), conversa marca venda mas FICA ABERTA pro pós.
          // Follow-ups pendentes morrem — comprador não leva cutucada.
          venda_sinalizada: { lead: 'comprou', conversa: 'venda', fecha: false },
        };
        const m = mapa[args.tipo];
        if (!m) return JSON.stringify({ erro: 'tipo inválido' });
        if (m.lead) {
          const extra = args.tipo === 'optout' ? { optout: true } : {};
          await sb().from('bia_leads').update({ estado: m.lead, ...extra, atualizado_em: new Date().toISOString() }).eq('id', ctx.leadId);
        }
        if (m.conversa || m.fecha) {
          await sb().from('bia_conversas').update({
            ...(m.conversa ? { resultado: m.conversa } : {}),
            ...(m.fecha ? { aberta: false } : {}),
            atualizado_em: new Date().toISOString(),
          }).eq('id', ctx.conversaId);
        }
        if (args.tipo === 'optout' || args.tipo === 'venda_sinalizada' || args.tipo === 'comprou_antes') {
          await sb().from('bia_followups').update({ status: 'cancelado' }).eq('lead_id', ctx.leadId).eq('status', 'pendente');
        }
        await sb().from('bia_mensagens').insert({ conversa_id: ctx.conversaId, papel: 'sistema', conteudo: `[desfecho] ${args.tipo}: ${args.detalhe || ''}` });
        return JSON.stringify({ ok: true });
      }
      case 'atualizar_etapa': {
        await sb().from('bia_conversas').update({ etapa: args.etapa, atualizado_em: new Date().toISOString() }).eq('id', ctx.conversaId);
        return JSON.stringify({ ok: true, etapa: args.etapa });
      }
      default:
        return JSON.stringify({ erro: `tool desconhecida: ${nome}` });
    }
  } catch (e) {
    return JSON.stringify({ erro: String(e?.message || e) });
  }
}

// ========================================================================
// System prompt — Metodologia Bia
// ========================================================================
function montarSystemPrompt(cfg: Record<string, string>, nomeLead: string | null): string {
  const garantia = cfg['garantia_dias'] || '7';
  const cartaNaManga = cfg['carta_na_manga'] || '';
  const janela = cfg['janela_condicao'];
  const temJanela = janela && janela !== 'PENDENTE';

  return `Você é a BIA, assistente do time do Pedro Aredes. Você conversa por WhatsApp com pessoas que participaram do Desafio Low Ticket (evento de 1 dia com o Pedro), viram a oferta do ProAlt no evento e NÃO compraram. Seu número é o MESMO que deu as boas-vindas quando a pessoa entrou no desafio — vocês já se falaram.

Sua missão: VENDER o ProAlt. Você não é suporte, não é tira-dúvidas genérico. Você é a melhor vendedora consultiva do Brasil: humana, atenciosa, direta, que diagnostica antes de oferecer e nunca empurra.

${nomeLead ? `O lead se chama ${nomeLead}. Use o primeiro nome com naturalidade (não em toda mensagem).` : 'Você ainda não sabe o nome do lead — descubra com naturalidade se fizer sentido.'}

# O DESAFIO E A GRAVAÇÃO

O lead COMPROU o Desafio Low Ticket. A aula AO VIVO com o Pedro foi no sábado, 23/08/2026. Alguns acompanharam ao vivo, outros não conseguiram e querem a gravação. NÃO assuma que ele esteve ao vivo.

Quando o lead pedir a GRAVAÇÃO / disser que perdeu / quer rever:
- Tranquiliza: "o time tá trabalhando na edição e a gravação fica disponível até terça de manhã (26/08), lá na área de membros da Hotmart, no mesmo lugar que você acessa o desafio".
- Avisa: "a gente vai avisar no grupo do desafio assim que liberar, pode ficar tranquilo".
- E VOLTA NA HORA pro ProAlt: "mas isso não te trava aqui, viu? Eu mesma te explico tudo do ProAlt agora, que é o próximo passo pra quem fez o desafio."

⚡ REGRA: a gravação NÃO pode virar desculpa pra adiar a conversa. Nunca deixe o lead "esperar a aula pra decidir". Responde a dúvida da gravação em 1-2 frases e emenda direto pro diagnóstico/venda do ProAlt. Nunca cobre "você viu a aula?" como pré-requisito — você explica o ProAlt independente disso.

# O PRODUTO (fatos FIXOS — nunca invente além disso)

- ProAlt: programa de aceleração de Low Ticket do Pedro Aredes. NÃO é um curso — é um sistema de execução anti falhas e prejuízos. Promessa: 1 ano de aceleração para estruturar um Low Ticket capaz de ultrapassar 100 mil/mês.
- Mecanismo: os 4 Elementos do Digital NA ORDEM CERTA — Produto → Página → Tráfego → Escala. "Quando você usa a ordem certa, o resultado deixa de ser sorte."
- Entrega: metodologia gravada (20 módulos) + APP ProAlt + comunidade WhatsApp (1 ano, ~670 membros) + onboarding em grupo (30 dias) + tira-dúvidas DIÁRIO com estrategistas + 1 call mensal em grupo com o Pedro + suporte seg-sex 09:30-17:30. Acesso ao app liberado NA HORA da compra.
- ACESSO É AUTOMÁTICO E IMEDIATO, SEM AGENDAMENTO: comprou → pagamento reconhecido → acesso liberado na hora. NÃO existe "programar data de acesso" nem "agendar pra começar depois". Se o lead disser que quer acessar/começar só mais pra frente (ex: "vou programar o boleto pra pagar depois e acessar depois", "quero deixar agendado pra semana que vem"): explique com clareza que não dá pra escolher data — o acesso vem junto com o pagamento. Se ele quer começar depois, o caminho é COMPRAR depois. PORÉM: comprando depois, você NÃO garante os mesmos valores nem os mesmos bônus da condição atual (é o argumento pra ele entrar agora). Boleto: o acesso libera quando o boleto é COMPENSADO (pode levar 1-2 dias úteis), não na emissão — deixe isso claro se ele escolher boleto.
- PREÇO: ${cfg['preco_avista'] || 'R$ 2.500'} à vista ou ${cfg['preco_parcelado'] || '12x de R$ 258'}. (Valor real do programa: ${cfg['preco_ancora'] || 'R$ 6.997'} — ancore ANTES de falar o preço quando possível.) 12x R$ 258 = menos de R$ 9 por dia.
- GARANTIA: ${garantia} dias incondicional. Entrou, assistiu, usou o app e viu que não é pra você? Devolve tudo. Use no FECHAMENTO como redutor de risco — nunca como "compra só pra testar".
- BÔNUS (todos nomeados, nunca invente outros): ${cfg['bonus_lista'] || ''}
- CHECKOUT PADRÃO (cartão/Pix — é o que você manda SEMPRE): ${cfg['checkout_padrao'] || '[link pendente]'}
- CHECKOUT BOLETO (parcelado no boleto): ${cfg['checkout_boleto'] || '[link pendente]'} — ${cfg['regra_boleto'] || 'SÓ mande se o cliente PEDIR boleto.'}
${temJanela ? `- URGÊNCIA DA CONDIÇÃO: ${janela}` : '- Não há prazo configurado: NÃO invente urgência de data.'}

# O APP (o argumento 80/20 — a maioria compra POR ISSO)

Chame de "o app" ou "o Sistema" — NUNCA "a IA" ao descrever funcionalidades. Uso ILIMITADO, sem trava. "Você comanda. O Sistema opera." Mapa dor → funcionalidade:
- "não sei o que vender" → Criação de Persona + Gerador de Soluções (compara várias ideias antes de produzir)
- "não sei quem é meu público" → Persona (joga um vídeo/áudio/texto, devolve dores nas palavras do cliente)
- "não sei escrever copy / copywriter é caro" → Gerador de Páginas (12 dobras, copy que custaria R$ 1.500-5.000) + Gerador de Ofertas
- "não tenho tempo de criar produto" → Ficha de Produto + Gerador de Prompt de Produto (de semanas pra horas)
- "travei pra publicar" → Kit Hotmart (tudo mastigado, até capa/mockup)
- "não sei o que gravar" → Gerador de Criativos + 50 roteiros prontos
- "meu anúncio não vende" → Analisador de Criativo (nota 0-10 ANTES de gastar 1 real) + biblioteca de anúncios validados
- "gasto e não vendo" → Raio-X do Tráfego (aponta exatamente onde o funil quebra)
- "minha página não converte" → Analisador de Página (nota dobra por dobra)
- "meu concorrente vende mais" → Garimpar Criativos (espiona o que roda no nicho agora)
- "vendo mas não sobra" → Gerador de Ofertas com order bump/upsell + Mapeador de Funil
- "tô perdido" → Playbooks (o que fazer primeiro, segundo, terceiro)
Argumento síntese: o app substitui copywriter + designer + pesquisador + analista de tráfego. E tudo conversa entre si: persona alimenta produto, que alimenta oferta, página e criativos.

# METODOLOGIA (máquina de estados — use atualizar_etapa ao avançar)

⚡ REGRA-MÃE (a mais importante de todas): você é VENDEDORA, não entrevistadora. Diagnóstico é MEIO, não fim. No WhatsApp o lead cansa rápido: cada pergunta a mais é risco de ele sumir. Na dúvida entre PERGUNTAR mais ou APRESENTAR a solução → APRESENTE. É melhor uma venda tentada do que um lead entediado. Objetivo de toda conversa: chegar no checkout, não coletar informação.

TETO DE PERGUNTAS: no MÁXIMO 2 trocas de diagnóstico (2 respostas do lead). Assim que o lead nomear UMA dor concreta (ex.: "não sei fazer página", "não sei a copy", "não tenho produto"), PARE de perguntar e VÁ PRA OFERTA na próxima mensagem. Nunca faça uma 3ª pergunta de diagnóstico se já tem uma dor clara na mão.

UMA pergunta por mensagem. NUNCA duas perguntas juntas (ex.: "você já tentou? e há quanto tempo?" é PROIBIDO — escolha uma).

1. **reconexao** (1 msg): "aqui é a Bia, do time do Pedro" + micro-contrato curto + 1 pergunta de abertura. NUNCA venda aqui. Lead respondeu → diagnostico. Se já veio com objeção → objecoes.
2. **diagnostico** (1-2 trocas, NÃO MAIS): descubra a dor principal com 1 pergunta certeira ("o que mais te trava hoje pra tirar isso do papel?"). Se der, entenda em meia linha por que não entrou no evento. Assim que tiver UMA dor concreta → oferta IMEDIATAMENTE. NÃO fique cavando "há quanto tempo", "quanto te custou", "quanto importa pra você" em sequência — isso afunda a conversa. Uma amplificação leve no máximo, e olhe lá.
3. **oferta** (assim que tiver a dor — não espere o lead "estar pronto"): conecte a dor dele DIRETO à solução. Estrutura curta: "é exatamente isso que o ProAlt resolve" + a funcionalidade do app que mata a dor dele ("o app escreve tua página de vendas dobra por dobra") + 1 frase de reforço (encontro com Pedro / comunidade / método). Sem enrolar. Depois de apresentar, caminhe pro preço/fechamento com naturalidade.
4. **prova_social** (quando o lead duvida "será que funciona pro meu caso"): use buscar_depoimento passando o NICHO + TIPO DE PRODUTO dele. MALÍCIA: se não houver case do nicho exato, NUNCA diga "não temos do seu nicho" — use um case de situação parecida ("não tenho de professora de português na mão, mas tenho de gente que também vendia template/material pronto e conseguiu"). O que vende é o MÉTODO funcionar, não o nicho idêntico. Se o case tiver um imagem_link, MANDE O LINK ("olha o print do resultado dele: [link]") — o print real é a prova mais forte que existe. UM case certeiro, não metralhadora. Se o lead já tá quente, pule pro fechamento.
5. **objecoes**: tom calmo → rotule ("parece que...") → 1 pergunta calibrada se precisar → argumento. NUNCA "por quê". Mesma objeção 2x = amplifique a dor uma vez, não repita argumento. Não transforme objeção em novo interrogatório.
6. **fechamento** (puxe você, não espere o lead pedir): assim que apresentou a oferta e ele não recusou, ofereça o próximo passo: link do checkout padrão + binária ("prefere à vista no Pix ou 12x no cartão?"). Garantia de ${garantia} dias como redutor de risco. Toda mensagem termina com um próximo passo claro, nunca no ar.
   🃏 CARTA NA MANGA (NO MÁXIMO 1x por lead, SÓ no fechamento com lead hesitando — nunca de cara, nunca em lista): ${cartaNaManga}
7. **pos** (comprou/sinalizou compra): parabenize, diga o que acontece em 24h (app na hora, aulas, grupo) e antecipe o remorso ("pode bater um 'será que fiz certo' — normal, faz a aula 1 hoje que isso morre"). Use registrar_desfecho(venda_sinalizada).

FLUXO IDEAL (mire nisso): abre → 1-2 perguntas → apresenta o ProAlt amarrado à dor → preço → fecha. Uma conversa de venda no WhatsApp que converte tem POUCAS mensagens, não muitas. Se você passou de 4 respostas suas sem ter apresentado o ProAlt e o preço, você errou — corrija apresentando AGORA.

# QUEBRAS DE OBJEÇÃO (resumo do playbook)

- "Tá caro" → espelhe ("pesado pra você agora?") → conta com os números QUE ELE deu no diagnóstico → 12x R$ 258 = R$ 9/dia vs o custo de continuar parado. NUNCA desconto.
- "Vou pensar" → "claro! só me ajuda: você tá pensando no conteúdo, no investimento ou no timing?" Se vago: "você desistiu de [objetivo dele]?" (a resposta "não" reabre).
- "Não tenho dinheiro" → rotule sem julgar → "como isso muda em 60 dias?" → 12x (1ª parcela só mês que vem) → se realmente não cabe, libere com respeito e combine data de retorno.
- "Já comprei curso e não funcionou" → antecipe: "deixa eu adivinhar: 'mais um curso que promete e não entrega', né? Justo." → pergunte o que houve → diferencial CONCRETO (app + acompanhamento diário + comunidade ≠ curso gravado solto) + case de aluno que vinha queimado.
- "Preciso falar com esposa/marido/sócio" → valide → "o que ela/ele costuma questionar?" → ofereça resumo de 3 pontos pra conversa.
- "Não tenho nicho / não sei o que vender" → "calma — é exatamente o que os primeiros módulos e o app resolvem. O Pedro te leva pela mão nisso." (35% dos alunos entraram assim.)
- "Preciso aparecer?" → "mesmo que você não queira aparecer — tem estratégia pros bastidores. E se quiser aparecer, escala mais."
- "Não tenho verba pra tráfego" → existe bônus/aula "5 Estratégias para fazer de 2 a 10 mil em 30 dias" + o método começa com verba pequena de teste.
- "Será que funciona pro meu nicho?" → "honestamente? talvez não — me conta teu cenário" (desarma) → case parecido → "o que precisaria ser verdade pra VOCÊ acreditar?"
- "Vou esperar a próxima" → "o que muda entre agora e a próxima?" + conta de trás pra frente do prazo DELE.

# REGRAS DE OURO (leis — violar qualquer uma é falha grave)

1. NUNCA apresente preço antes de o lead verbalizar dor + custo. Se ele perguntar o preço cedo, responda ("R$ 2.500 ou 12x de R$ 258") SEM enrolação e emende UMA pergunta de diagnóstico — nunca sonegue preço, mas nunca deixe ele nu sem contexto de valor.
2. Mensagens CURTAS de WhatsApp. 1 ideia por bolha, no MÁXIMO 2 frases (~250 caracteres) por bolha. Máximo 3 bolhas por resposta (separe com |||) — e o normal é 1-2. Nada de parágrafos longos: se precisar de mais, guarde pro próximo turno. O lead deve falar MAIS que você.
3. NUNCA "por quê" em objeção. NUNCA "como você se sente?".
4. NUNCA desconto. NUNCA urgência/escassez inventada. NUNCA bônus fora da lista.
5. NUNCA linguagem de coach ("transforme sua vida", "realize seus sonhos", "oportunidade única", "incrível"). Número concreto sempre.
6. NUNCA minta ou exagere case. Se o lead não tem perfil, diga com respeito e use registrar_desfecho(desqualificado).
7. Se perguntarem se você é robô/IA: NUNCA negue, NUNCA faça disso um tema. Responda leve em 1 frase — "sou a assistente do time do Pedro, trabalho com IA e o time acompanha tudo por aqui 🙂" — e na MESMA mensagem volte pro assunto. Se a pessoa insistir que só fala/compra com humano → acionar_humano.
8. "Quero falar com humano/atendente/pessoa" (ou irritação clara) → acionar_humano IMEDIATAMENTE. Não discuta.
9. "Já comprei / já sou aluno" → parabenize com entusiasmo genuíno, aponte pro app e pras aulas, registrar_desfecho(comprou_antes), encerre com carinho.
10. Pedido de SUPORTE (acesso, login, senha, reembolso, boleto já emitido) → você não resolve: passe o contato do suporte${cfg['contato_suporte'] && cfg['contato_suporte'] !== 'PENDENTE' ? ` (${cfg['contato_suporte']})` : ' (time de suporte do ProAlt)'} e volte ao seu papel se couber.
11. Pedido explícito pra parar de receber mensagem → registrar_desfecho(optout) + despedida curta e elegante. Sem tentar reverter.
12. ÁUDIO E IMAGEM: quando o lead manda áudio, você recebe a transcrição — responda normal (em texto), sem comentar que "ouviu um áudio". Quando manda IMAGEM, você a vê: COMPROVANTE de pagamento/pedido aprovado → comemore, registrar_desfecho(venda_sinalizada) e vá pro pós-venda · print de ERRO/tela de checkout → oriente com calma o próximo passo · print de página/anúncio/métricas do negócio DELE → comente algo específico do que viu (gera confiança absurda) e conecte com o diagnóstico · imagem aleatória/meme → reaja leve em 1 frase e volte ao assunto.
13. Emojis: no máximo 1 por mensagem, nem sempre. Português brasileiro natural, informal-profissional. Tom do ecossistema Pedro Aredes: próximo, direto, intenso na medida — ecoe expressões dele com moderação ("bora", "vale demais", "de uma vez por todas", "calma, te mostro") sem imitar.

# FERRAMENTAS

Use buscar_cerebro pra detalhe do método/app/pitch que você não tem aqui. Use buscar_depoimento pra prova social contextualizada. Use atualizar_etapa ao avançar no funil. Fatos de preço/garantia/checkout você JÁ TEM — não busque.

# FORMATO DA RESPOSTA

Só o texto das mensagens (bolhas separadas por |||). Sem markdown, sem listas com asterisco, sem cabeçalho. Como uma pessoa digita no WhatsApp.`;
}

// ========================================================================
// Normalizador de payload — entende o formato NATIVO da Unichat e o simples.
//
// Unichat manda (visto no teste real 2026-08-22):
//   { contact: { name, email, phoneNumber, tags, lastMessage,
//                lastMessageData: { message, messageType, id }, fields },
//     event_date, triggerData: {...} }
//
// Formato simples (testes internos): { telefone, nome, mensagem, evento, midia_url, teste }
//
// Eventos por TAG (a Unichat marca tags; a gente lê a intenção delas):
//   tag contém "quero" / "saber-mais" / "conta-mais" → clique_me_conta_mais
//   tag contém "mais-tarde" / "depois"               → chama_mais_tarde
//   tag contém "parar" / "nao-quero" / "optout"      → parar_avisos
// (nomes flexíveis — o Andre decide os slugs das tags e a gente casa por substring)
// ========================================================================
function normalizarPayload(raw: any): {
  telefone: string; nome: string; mensagem: string;
  evento: string; midia_url: string; teste: boolean; sync?: boolean;
} {
  // Já é o formato simples?
  if (raw?.telefone || raw?.phone) {
    return {
      telefone: raw.telefone || raw.phone || '',
      nome: raw.nome || raw.name || '',
      mensagem: raw.mensagem || raw.message || raw.text || '',
      evento: raw.evento || 'mensagem',
      midia_url: raw.midia_url || raw.media_url || raw.audio_url || raw.image_url || '',
      teste: raw.teste === true,
      sync: raw.sync === true,
    };
  }

  // Formato nativo Unichat
  const c = raw?.contact || {};
  const lmd = c.lastMessageData || {};
  const tagsArr: string[] = Array.isArray(c.tags)
    ? c.tags
    : typeof c.tags === 'string' ? c.tags.split(',') : [];
  const tags = tagsArr.map((t: string) => String(t).toLowerCase().trim());
  const temTag = (frags: string[]) => tags.some(t => frags.some(f => t.includes(f)));

  // Intenção explícita pode vir em raw.evento OU raw.contact.fields.evento (se o
  // Andre preferir passar num field), senão inferimos pela tag.
  // Prioridade: parar > mais-tarde > ativar (o opt-out sempre vence — segurança).
  //
  // ⚠️ SEGURANÇA (pedido Andre 22/08): as tags de acionamento têm que ser
  // EXCLUSIVAS da Bia — NADA de casar por "quero"/"saber mais" genérico, senão um
  // template/anúncio futuro com esse CTA comum aciona a IA sem querer. Por isso
  // exigimos o prefixo "bia-" nas tags de acionamento:
  //   bia-ativar / bia-conversar / bia-quero-condicao  → abre a conversa
  //   bia-mais-tarde                                    → follow-up depois
  //   bia-parar / bia-optout                            → opt-out
  // A tag de acionamento FICA grudada no contato → vira 'quero_ou_continua'
  // (handler decide abrir vs continuar pelo histórico).
  let evento = raw.evento || c.fields?.evento || '';
  if (!evento) {
    if (temTag(['bia-parar', 'bia-optout', 'bia-opt-out', 'bia-nao-quero', 'bia-descadastr'])) evento = 'parar_avisos';
    else if (temTag(['bia-mais-tarde', 'bia-depois', 'bia-maistarde'])) evento = 'chama_mais_tarde';
    else if (temTag(['bia-ativar', 'bia-conversar', 'bia-quero', 'bia-condicao', 'bia-condição', 'bia-saber'])) evento = 'quero_ou_continua';
    else evento = 'mensagem';
  }

  // Mídia: a Unichat costuma sinalizar tipo em messageType (image/audio) e a URL
  // no próprio message ou num campo de anexo. Cobrimos os nomes mais prováveis.
  const tipoMsg = String(lmd.messageType || '').toLowerCase();
  let midia_url = c.mediaUrl || lmd.mediaUrl || lmd.url || lmd.fileUrl || raw.midia_url || '';
  const msgTexto = c.lastMessage || lmd.message || '';
  // Se o messageType é mídia e o "texto" parece uma URL, trata como mídia
  if (!midia_url && (tipoMsg.includes('image') || tipoMsg.includes('audio') || tipoMsg.includes('ptt') || tipoMsg.includes('voice')) && /^https?:\/\//i.test(msgTexto)) {
    midia_url = msgTexto;
  }

  return {
    telefone: c.phoneNumber || c.phone || '',
    nome: c.name || '',
    mensagem: midia_url && midia_url === msgTexto ? '' : msgTexto,
    evento,
    midia_url,
    teste: raw.teste === true,
    sync: raw.sync === true,   // permite forçar síncrono em teste mesmo no payload nativo
  };
}

// ========================================================================
// Handler
// ========================================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsTool, 'Access-Control-Allow-Headers': corsTool['Access-Control-Allow-Headers'] + ', x-bia-token' } });
  }
  if (req.method !== 'POST') return jsonRespTool({ error: 'POST only' }, 405);

  // Auth: interno OU token dedicado da Unichat (cofre)
  let autorizado = await requireAuthTool(req);
  if (!autorizado) {
    const biaToken = req.headers.get('x-bia-token') || '';
    if (biaToken) {
      try {
        const esperado = await getChave('BIA_UNICHAT_TOKEN', 'bia-vendas-proalt');
        autorizado = !!esperado && biaToken === esperado;
      } catch { autorizado = false; }
    }
  }
  if (!autorizado) return jsonRespTool({ error: 'não autorizado' }, 401);

  const t0 = Date.now();
  let raw: any;
  try { raw = await req.json(); } catch { return jsonRespTool({ error: 'JSON inválido' }, 400); }

  // Normaliza: aceita o formato NATIVO da Unichat (objeto `contact` + triggerData)
  // e o formato simples { telefone, nome, mensagem, evento } (testes internos).
  const body = normalizarPayload(raw);

  const telefone = telefoneCanonico(body.telefone || '');
  if (!telefone) return jsonRespTool({ error: 'telefone inválido', payload_visto: Object.keys(raw || {}) }, 400);
  const nome = (body.nome || '').trim() || null;
  let mensagem = (body.mensagem || '').trim();
  let evento = body.evento || 'mensagem';   // let: resolvido depois (quero_ou_continua)
  const ehTeste = body.teste === true;

  const db = sb();

  // Config primeiro: decide o modo de entrega da resposta.
  //   unichat_resposta_url = PENDENTE → SÍNCRONO (resposta no corpo HTTP — testes)
  //   unichat_resposta_url configurada → ASSÍNCRONO (ack 202 na hora; a resposta
  //     é POSTada no fluxo "Resposta da IA" da Unichat quando ficar pronta —
  //     o bloco HTTP da Unichat não espera o LLM pensar)
  //   body.sync === true força síncrono mesmo com URL configurada (debug)
  const { data: cfgRows } = await db.from('bia_config').select('chave, valor');
  const config: Record<string, string> = {};
  (cfgRows || []).forEach((r: any) => { config[r.chave] = r.valor; });
  const respostaUrl = (config['unichat_resposta_url'] || '').trim();
  const asyncMode = !!respostaUrl && respostaUrl !== 'PENDENTE' && body.sync !== true;

  const processar = async (): Promise<any> => {

  // ---------------------------------------------------------------
  // 0. Mídia do lead (áudio → transcreve; imagem → visão multimodal)
  // ---------------------------------------------------------------
  const midiaUrl = (body.midia_url || body.media_url || body.audio_url || body.image_url || '').trim();
  let imagemDataUrl: string | null = null;
  let marcadorMidia = '';
  if (midiaUrl && evento !== 'parar_avisos' && evento !== 'chama_mais_tarde') {
    try {
      const { bytes, contentType } = await baixarMidia(midiaUrl);
      const tipo = inferirTipoMidia(midiaUrl, contentType, body.midia_tipo || body.media_type);
      if (tipo === 'audio') {
        const transcricao = await transcreverAudio(bytes, contentType);
        mensagem = [mensagem, transcricao].filter(Boolean).join(' — ').trim();
        marcadorMidia = '[áudio] ';
      } else if (tipo === 'imagem') {
        imagemDataUrl = bytesParaDataUrl(bytes, contentType);
        marcadorMidia = '[imagem] ';
      } else {
        throw new Error(`tipo não suportado (${contentType})`);
      }
    } catch (e) {
      console.warn('[bia] mídia falhou:', String(e?.message || e));
      // Não trava a venda: resposta determinística pedindo texto (sem gastar LLM)
      const bolha = 'Opa, não consegui abrir o que você mandou aqui 🙈 Consegue me escrever em texto rapidinho?';
      return { ok: true, telefone, mensagens: [bolha], resposta: bolha, midia_erro: true };
    }
  }

  // ---------------------------------------------------------------
  // 1. Lead: SELECT antes de CREATE
  // ---------------------------------------------------------------
  let { data: lead } = await db.from('bia_leads').select('*').eq('telefone', telefone).maybeSingle();
  if (!lead) {
    const { data: novo, error: eL } = await db.from('bia_leads').insert({
      telefone,
      nome,
      origem: ehTeste ? 'teste' : 'desafio-low-ticket',
      estado: 'conversando',
    }).select('*').single();
    if (eL) return { error: `criar lead: ${eL.message}`, status: 500 };
    lead = novo;
  } else if (nome && !lead.nome) {
    await db.from('bia_leads').update({ nome, atualizado_em: new Date().toISOString() }).eq('id', lead.id);
    lead.nome = nome;
  }

  // ---------------------------------------------------------------
  // 2. Bloqueios absolutos: optout e humano — a Bia NUNCA responde
  // ---------------------------------------------------------------
  if (lead.optout || lead.estado === 'optout') {
    return { ok: true, telefone, mensagens: [], ignorado: 'optout', lead_estado: 'optout' };
  }
  if (lead.estado === 'humano') {
    return { ok: true, telefone, mensagens: [], ignorado: 'humano', lead_estado: 'humano' };
  }

  // ---------------------------------------------------------------
  // 3. Eventos de botão (sem LLM)
  // ---------------------------------------------------------------
  if (evento === 'parar_avisos') {
    await db.from('bia_leads').update({ optout: true, estado: 'optout', atualizado_em: new Date().toISOString() }).eq('id', lead.id);
    await db.from('bia_followups').update({ status: 'cancelado' }).eq('lead_id', lead.id).eq('status', 'pendente');
    await db.from('bia_conversas').update({ aberta: false, resultado: 'optout' }).eq('lead_id', lead.id).eq('aberta', true);
    return {
      ok: true,
      telefone,
      mensagens: ['Tranquilo! Não te mando mais nada por aqui. Se um dia quiser retomar, é só chamar. Sucesso! 🙌'],
      lead_estado: 'optout',
    };
  }

  if (evento === 'chama_mais_tarde') {
    const agendado = new Date(Date.now() + 2.5 * 60 * 60 * 1000).toISOString();
    await db.from('bia_leads').update({ estado: 'aguardando_retorno', atualizado_em: new Date().toISOString() }).eq('id', lead.id);
    await db.from('bia_followups').insert({ lead_id: lead.id, tipo: 'chama_mais_tarde', agendado_para: agendado });
    return {
      ok: true,
      telefone,
      mensagens: [`Fechado${lead.nome ? ', ' + lead.nome.split(' ')[0] : ''}! Te chamo daqui a pouco então 🙂`],
      lead_estado: 'aguardando_retorno',
    };
  }

  // ---------------------------------------------------------------
  // 4. Conversa: abre/recupera + histórico
  // ---------------------------------------------------------------
  let { data: conversa } = await db.from('bia_conversas')
    .select('*').eq('lead_id', lead.id).eq('aberta', true)
    .order('criado_em', { ascending: false }).limit(1).maybeSingle();
  if (!conversa) {
    const { data: nova, error: eC } = await db.from('bia_conversas').insert({ lead_id: lead.id }).select('*').single();
    if (eC) return { error: `criar conversa: ${eC.message}`, status: 500 };
    conversa = nova;
  }

  // Lead respondeu → cancela follow-ups pendentes (não persegue quem voltou)
  await db.from('bia_followups').update({ status: 'cancelado' }).eq('lead_id', lead.id).eq('status', 'pendente');
  if (lead.estado !== 'conversando') {
    await db.from('bia_leads').update({ estado: 'conversando', atualizado_em: new Date().toISOString() }).eq('id', lead.id);
  }

  // ---------------------------------------------------------------
  // 5. Guardrail determinístico: opt-out em texto livre
  // ---------------------------------------------------------------
  if (mensagem && ehOptoutTexto(mensagem)) {
    await db.from('bia_mensagens').insert({ conversa_id: conversa.id, papel: 'lead', conteudo: mensagem });
    await db.from('bia_leads').update({ optout: true, estado: 'optout', atualizado_em: new Date().toISOString() }).eq('id', lead.id);
    await db.from('bia_conversas').update({ aberta: false, resultado: 'optout' }).eq('id', conversa.id);
    await db.from('bia_followups').update({ status: 'cancelado' }).eq('lead_id', lead.id).eq('status', 'pendente');
    const bolha = 'Entendido, paro por aqui! Obrigada pelo papo e sucesso na tua caminhada 🙌';
    await db.from('bia_mensagens').insert({ conversa_id: conversa.id, papel: 'bia', conteudo: bolha });
    return { ok: true, telefone, mensagens: [bolha], lead_estado: 'optout' };
  }

  // ---------------------------------------------------------------
  // 5b. TRAVA: já comprou? (checa a CADA mensagem — pode ter comprado
  //     há 3 minutos por QUALQUER link, não só o da Bia)
  // ---------------------------------------------------------------
  let jaComprou = lead.estado === 'comprou' || lead.estado === 'comprou_antes';
  if (!jaComprou) {
    jaComprou = await verificarCompraProAlt(telefone, lead.email || null);
    if (jaComprou) {
      await db.from('bia_leads').update({ estado: 'comprou', atualizado_em: new Date().toISOString() }).eq('id', lead.id);
      await db.from('bia_conversas').update({ etapa: 'pos', resultado: 'venda', atualizado_em: new Date().toISOString() }).eq('id', conversa.id);
      await db.from('bia_followups').update({ status: 'cancelado' }).eq('lead_id', lead.id).eq('status', 'pendente');
      await db.from('bia_mensagens').insert({ conversa_id: conversa.id, papel: 'sistema', conteudo: '[trava] compra aprovada detectada no app ProAlt (Hotmart)' });
      lead.estado = 'comprou';
    }
  }

  // ---------------------------------------------------------------
  // 6. Histórico + prompt (config já carregada lá em cima)
  // ---------------------------------------------------------------
  const { data: histRows } = await db.from('bia_mensagens')
    .select('papel, conteudo, criado_em')
    .eq('conversa_id', conversa.id)
    .order('criado_em', { ascending: false })
    .limit(HISTORICO_MAX_MSGS);
  const historico = (histRows || []).reverse();

  const llmMessages: any[] = historico.map((m: any) => ({
    role: m.papel === 'lead' ? 'user' : m.papel === 'bia' ? 'assistant' : 'system',
    content: m.papel === 'sistema' ? `[evento] ${m.conteudo}` : m.conteudo,
  }));

  // Resolve o evento provisório da tag "quero" (que fica grudada no contato):
  //  - conversa nova / sem nenhuma fala da Bia ainda → ABRIR (clique_me_conta_mais)
  //  - já houve conversa (a Bia já falou) → é continuação → tratar como 'mensagem'
  // Assim o fluxo Conversa reenvia a tag sem reabrir; o fluxo Ativador (1º clique)
  // cai na abertura naturalmente porque ainda não há histórico.
  if (evento === 'quero_ou_continua') {
    const jaFalou = historico.some((m: any) => m.papel === 'bia');
    evento = jaFalou ? 'mensagem' : 'clique_me_conta_mais';
  }

  let minhaMsgId: string | null = null;  // ID da mensagem do lead desta chamada (âncora do debounce)
  if (evento === 'clique_me_conta_mais') {
    const msgSistema = 'O lead clicou no botão "Me conta mais" do template inicial (sobre a condição especial do ProAlt pra quem fez o desafio). Abra a conversa: etapa reconexao — reancore no desafio, micro-contrato, e faça a primeira pergunta. NÃO venda ainda.';
    await db.from('bia_mensagens').insert({ conversa_id: conversa.id, papel: 'sistema', conteudo: '[clique] Me conta mais' });
    llmMessages.push({ role: 'system', content: msgSistema });
    if (mensagem) {
      const { data: ins } = await db.from('bia_mensagens').insert({ conversa_id: conversa.id, papel: 'lead', conteudo: mensagem }).select('id').single();
      minhaMsgId = ins?.id || null;
      llmMessages.push({ role: 'user', content: mensagem });
    }
  } else {
    if (!mensagem && !imagemDataUrl) return { error: 'mensagem vazia', status: 400 };
    const conteudoDb = marcadorMidia + (mensagem || (imagemDataUrl ? '(imagem enviada pelo lead)' : ''));
    const { data: ins } = await db.from('bia_mensagens').insert({ conversa_id: conversa.id, papel: 'lead', conteudo: conteudoDb }).select('id').single();
    minhaMsgId = ins?.id || null;
    if (imagemDataUrl) {
      llmMessages.push({
        role: 'user',
        content: [
          { type: 'text', text: mensagem || 'O lead enviou esta imagem sem legenda. Interprete e reaja de acordo com o contexto da conversa.' },
          { type: 'image_url', image_url: { url: imagemDataUrl } },
        ],
      });
    } else {
      llmMessages.push({ role: 'user', content: mensagem });
    }
  }

  const meuTimestamp = new Date().toISOString();
  await db.from('bia_conversas').update({ ultima_msg_lead_em: meuTimestamp, atualizado_em: meuTimestamp }).eq('id', conversa.id);

  // -------------------------------------------------------------------
  // DEBOUNCE: espera o lead terminar de digitar (várias frases → 1 pergunta).
  // Enquanto espera, se chegar mensagem MAIS NOVA (outra chamada da edge),
  // esta desiste e deixa a mais nova responder — evita resposta dupla e
  // resposta a pergunta pela metade. Só quem for a "última" processa,
  // juntando tudo que o lead mandou desde a última fala da Bia.
  // Pulado para: eventos de botão (já respondem na hora, sem LLM),
  // imagem (comprovante precisa de reação imediata) e quando desligado.
  // -------------------------------------------------------------------
  const debounceSeg = Number(config['debounce_segundos'] ?? DEBOUNCE_SEG_DEFAULT);
  const aplicaDebounce = debounceSeg > 0 && !imagemDataUrl && evento !== 'clique_me_conta_mais' && !!minhaMsgId;
  if (aplicaDebounce) {
    // Timestamp exato da MINHA mensagem (âncora à prova de empate).
    const { data: minha } = await db.from('bia_mensagens').select('criado_em').eq('id', minhaMsgId).single();
    const meuCriadoEm = minha?.criado_em || meuTimestamp;
    const alvo = Date.now() + debounceSeg * 1000;
    while (Date.now() < alvo) {
      await new Promise(r => setTimeout(r, DEBOUNCE_PASSO_MS));
      // Chegou mensagem do lead depois da minha (id diferente, criada depois)?
      // Então NÃO sou o último — outra chamada vai responder por todas.
      const { data: maisNova } = await db.from('bia_mensagens')
        .select('id')
        .eq('conversa_id', conversa.id)
        .eq('papel', 'lead')
        .gt('criado_em', meuCriadoEm)
        .neq('id', minhaMsgId)
        .limit(1)
        .maybeSingle();
      if (maisNova) {
        return { ok: true, telefone, mensagens: [], debounce: 'superado' };
      }
    }
    // Sobrevivi à espera: sou o último. Recarrega o histórico pra pegar TODAS
    // as frases que o lead mandou enquanto eu esperava (elas já estão no banco).
    const { data: histAtualizado } = await db.from('bia_mensagens')
      .select('papel, conteudo, criado_em')
      .eq('conversa_id', conversa.id)
      .order('criado_em', { ascending: false })
      .limit(HISTORICO_MAX_MSGS);
    const histNovo = (histAtualizado || []).reverse();
    // Reconstrói llmMessages com o histórico completo (inclui as frases extras).
    llmMessages.length = 0;
    for (const m of histNovo) {
      if (m.papel === 'sistema') {
        llmMessages.push({ role: 'system', content: `[evento] ${m.conteudo}` });
      } else {
        llmMessages.push({ role: m.papel === 'lead' ? 'user' : 'assistant', content: m.conteudo });
      }
    }
    if (evento === 'clique_me_conta_mais') {
      llmMessages.push({ role: 'system', content: 'O lead abriu a conversa. Etapa reconexao — reancore no desafio, micro-contrato, primeira pergunta. NÃO venda ainda.' });
    }
  }

  if (jaComprou) {
    llmMessages.push({
      role: 'system',
      content: 'ATENÇÃO: este lead JÁ TEM COMPRA APROVADA do ProAlt (registro oficial Hotmart no app). ' +
        'É PROIBIDO vender, mandar link de checkout, oferta ou bônus. Modo pós-venda/aluno: se for a primeira vez que isso aparece, ' +
        'parabenize e oriente os primeiros passos (app na hora, aulas em 24h, grupo). Se ele pedir algo de suporte, direcione ao suporte. ' +
        'Se só está conversando, seja breve, calorosa e encerre bem.',
    });
  }

  const systemPrompt = montarSystemPrompt(config, lead.nome);

  // ---------------------------------------------------------------
  // 7. Loop LLM com tools
  // ---------------------------------------------------------------
  const ctx = { leadId: lead.id, conversaId: conversa.id, config, anexos: [] as string[] };
  let respostaTexto = '';
  let totalIn = 0, totalOut = 0, totalCached = 0;
  let modeloUsado = MODELO;
  const toolsUsadas: string[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const llm = await chamarLLM({
      modelo: MODELO,
      systemPrompt,
      messages: llmMessages,
      tools: TOOLS,
      maxTokens: 900,
    }, 'bia-vendas-proalt');

    totalIn += llm.tokensIn; totalOut += llm.tokensOut; totalCached += llm.tokensCached;
    modeloUsado = llm.modeloUsado;

    if (!llm.toolCalls || llm.toolCalls.length === 0) {
      respostaTexto = llm.content || '';
      break;
    }

    llmMessages.push({
      role: 'assistant',
      content: llm.content || null,
      tool_calls: llm.toolCalls.map(tc => ({
        id: tc.id, type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });

    for (const tc of llm.toolCalls) {
      const resultado = await executarTool(tc.name, tc.arguments, ctx);
      toolsUsadas.push(tc.name);
      llmMessages.push({ role: 'tool', tool_call_id: tc.id, content: resultado });
    }

    if (round === MAX_TOOL_ROUNDS) respostaTexto = llm.content || '';
  }

  // ---------------------------------------------------------------
  // 8. Persiste resposta + custo
  // ---------------------------------------------------------------
  const bolhas = respostaTexto
    .split('|||')
    .map(b => b.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (bolhas.length > 0) {
    await db.from('bia_mensagens').insert(
      bolhas.map(b => ({ conversa_id: conversa.id, papel: 'bia', conteudo: b })),
    );
    await db.from('bia_conversas').update({ ultima_msg_bia_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq('id', conversa.id);
  }

  const custoUSD = calcularCustoUSD(modeloUsado, totalIn, totalOut, totalCached);
  await logarCustoFinOps({
    agenteSlug: 'bia-vendas-proalt',
    modelo: modeloUsado,
    custoUSD,
    tokensIn: totalIn,
    tokensOut: totalOut,
    tokensCached: totalCached,
  }).catch(() => {});

  // Estado final do lead (pode ter mudado via tools)
  const { data: leadFinal } = await db.from('bia_leads').select('estado').eq('id', lead.id).maybeSingle();
  const { data: convFinal } = await db.from('bia_conversas').select('etapa').eq('id', conversa.id).maybeSingle();

  return {
    ok: true,
    telefone,
    nome: lead.nome || null,
    mensagens: bolhas,
    resposta: bolhas.join('\n\n'),
    etapa: convFinal?.etapa || conversa.etapa,
    lead_estado: leadFinal?.estado || lead.estado,
    anexos: ctx.anexos,
    tools: toolsUsadas,
    conversa_id: conversa.id,
    custo_usd: Number(custoUSD.toFixed(6)),
    latencia_ms: Date.now() - t0,
  };

  }; // fim de processar()

  // ---------------------------------------------------------------
  // Entrega: assíncrona (Unichat) ou síncrona (testes/debug)
  // ---------------------------------------------------------------
  if (asyncMode) {
    // Ack IMEDIATO pro bloco HTTP da Unichat; o resultado vai pro fluxo
    // "Resposta da IA" quando o processamento terminar.
    // @ts-ignore — EdgeRuntime existe no runtime da Supabase
    EdgeRuntime.waitUntil((async () => {
      try {
        const payload = await processar();
        if (payload?.mensagens?.length) {
          const r = await fetch(respostaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!r.ok) {
            const respTxt = (await r.text()).slice(0, 300);
            console.error(`[bia][async] resposta-url ${r.status}: ${respTxt}`);
            // Só registra FALHA no envio (pra diagnosticar); sucesso não polui o histórico.
            await sb().from('bia_mensagens').insert({
              conversa_id: payload.conversa_id || null,
              papel: 'sistema',
              conteudo: `[callback F3 FALHOU] status=${r.status} resp=${respTxt}`,
            }).then(() => {}, () => {});
          }
        } else if (payload?.error) {
          console.error('[bia][async] processar erro:', payload.error);
        }
      } catch (e) {
        console.error('[bia][async] exceção:', String(e?.message || e));
      }
    })());
    return jsonRespTool({ ok: true, recebido: true, modo: 'async' }, 202);
  }

  try {
    const payload = await processar();
    return jsonRespTool(payload, payload?.error ? (payload.status || 400) : 200);
  } catch (e) {
    console.error('[bia][sync] exceção:', String(e?.stack || e?.message || e));
    return jsonRespTool({ error: 'erro interno', detalhe: String(e?.message || e) }, 500);
  }
});
