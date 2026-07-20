// ============================================================
// book-comercial-worker/roteiro.ts
// ============================================================
// Gera o SCRIPT DE TELEPROMPTER da análise de perfil ao vivo.
//
// Contexto (pedido do André 20/07): o comercial é bom de venda, mas
// pode não dominar conteúdo/Instagram. Este script dá autoridade
// emprestada — ele LÊ falas prontas em 1ª pessoa, com os fatos reais
// do perfil já embutidos (bio atual, números, frases dos reels), e
// soa como especialista. Zero esforço cognitivo: passo a passo,
// palavra por palavra, com direção de cena.
// ============================================================

import { getChave } from '../_shared/cofre.ts';

const TOOL_ROTEIRO = {
  type: 'function' as const,
  function: {
    name: 'gerar_roteiro_teleprompter',
    description: 'Script literal, passo a passo, pro comercial conduzir a análise de perfil ao vivo lendo como se fosse dele',
    parameters: {
      type: 'object',
      properties: {
        abertura: {
          type: 'string',
          description: 'Fala de abertura em 1ª pessoa (2-4 frases): o comercial anuncia que fez uma análise do perfil e vai compartilhar o que mais importa pra destravar engajamento/seguidores/vendas. Calorosa, confiante, sem jargão técnico.',
        },
        passos: {
          type: 'array',
          minItems: 4,
          maxItems: 7,
          description: 'Sequência da análise: bio → melhor conteúdo → conteúdo de menor performance → veredito/próximo passo. Cada passo é um bloco de teleprompter.',
          items: {
            type: 'object',
            properties: {
              titulo_secao: { type: 'string', description: 'Rótulo curto do que está sendo analisado (ex: "A sua bio", "Seu melhor conteúdo", "Onde travou").' },
              fala: {
                type: 'string',
                description: 'O SCRIPT LITERAL que o comercial lê em voz alta, 1ª pessoa, tom de especialista acessível. DEVE conter os fatos reais embutidos na fala (a bio atual entre aspas, os números do post, a frase do reel). Mastigado: quem nunca viu o perfil lê e soa expert. Use "..." pra pausas naturais. 4-8 frases por passo.',
              },
              direcao: {
                type: 'string',
                description: 'Direção de cena entre colchetes pro comercial (ex: "[aguarde ele reagir]", "[mostre a tela do post na chamada]", "[espere ele responder antes de seguir]"). 1 linha.',
              },
              fato_ancora: {
                type: 'string',
                description: 'O dado real citado neste passo (ex: "bio atual: ...", "12.500 curtidas", "frase do reel: ..."), pra o comercial saber de onde veio. Curto.',
              },
            },
            required: ['titulo_secao', 'fala', 'direcao', 'fato_ancora'],
          },
        },
        transicao_oferta: {
          type: 'string',
          description: 'Ponte final em 1ª pessoa (2-4 frases): fecha a análise e abre pra conversa de como a Pinguim ajuda a executar isso — SEM já cravar preço/produto (isso é decisão do consultor na hora). Gera desejo pelo próximo passo.',
        },
      },
      required: ['abertura', 'passos', 'transicao_oferta'],
    },
  },
};

const ROTEIRO_SYSTEM = `Você é roteirista de vendas consultivas. Sua tarefa: transformar uma análise técnica de perfil de Instagram num SCRIPT DE TELEPROMPTER que um vendedor lê AO VIVO durante uma call, palavra por palavra, como se o conhecimento fosse dele.

QUEM VAI LER: um comercial excelente em vendas, mas que NÃO domina conteúdo/Instagram. Ele não pode ter esforço cognitivo nem improvisar termos técnicos. Ele lê o que você escreve e precisa soar como um especialista sênior em conteúdo.

REGRAS DO SCRIPT:
1. Tudo em 1ª pessoa, como se o comercial estivesse falando com o cliente ("Olha, a sua bio hoje diz...", "Você viu esse seu reel? Ele bombou porque...").
2. EMBUTA OS FATOS REAIS na própria fala — a bio atual entre aspas, os números do post, a frase literal do reel, a nova bio sugerida. O comercial NÃO deve precisar buscar dado nenhum: já está escrito na fala dele.
3. Traduza todo jargão. Nada de "engagement rate", "gancho", "CTA" solto — explique em linguagem de gente ("as pessoas comentaram muito mais nesse do que nos outros", "a primeira frase que prende quem tá passando o dedo").
4. Tom: caloroso, confiante, generoso. Celebra o que o cliente acertou ANTES de mostrar o que melhorar. Nunca soa robótico nem genérico.
5. Sequência natural de uma análise: começa pela bio (a vitrine), depois o melhor conteúdo (elogia e explica o porquê do acerto, pra ele replicar), depois o conteúdo que teve menor alcance (construtivo, "aqui tem uma oportunidade"), e fecha com o veredito e o próximo passo.
6. Cada fala tem que ser AUTOSSUFICIENTE: se o comercial ler só aquele bloco, faz sentido sozinho.
7. NÃO invente números, frases ou dados que não estão no material fornecido. Se um dado não veio, não cite.
8. Português brasileiro falado, natural — é pra ser dito em voz alta, não lido no papel.`;

export async function gerarRoteiroAnalise(analise: any, leadNicho: string | null): Promise<any> {
  const openaiKey = await getChave('OPENAI_API_KEY', 'book-comercial-worker');

  const p = analise?.profile || {};
  const bio = analise?.bio_analysis || {};
  const ov = analise?.overview || {};
  const top = analise?.top_post || {};
  const worst = analise?.worst_post || {};

  const bloco = (t: any) => {
    const a = t?.analysis || {};
    return [
      `- tipo: ${t.post_type || '?'} | ${t.likes ?? '?'} curtidas | ${t.comments ?? '?'} comentários${t.views ? ` | ${t.views} views` : ''}`,
      `- legenda: "${(t.full_caption || '').slice(0, 300)}"`,
      t.transcript ? `- fala do vídeo (trecho): "${String(t.transcript).slice(0, 400)}"` : '',
      a.resumo_desempenho ? `- por que performou assim: ${a.resumo_desempenho}` : '',
      a.fatores_positivos?.length ? `- acertos: ${a.fatores_positivos.join('; ')}` : '',
      a.fatores_negativos?.length ? `- pontos fracos: ${a.fatores_negativos.join('; ')}` : '',
      a.citacoes_de_impacto?.length ? `- frases de impacto: ${a.citacoes_de_impacto.map((c: string) => `"${c}"`).join(' ')}` : '',
    ].filter(Boolean).join('\n');
  };

  const userMsg = `PERFIL: @${p.handle} — ${p.followers || 0} seguidores${leadNicho ? ` · nicho: ${leadNicho}` : ''}.
Nota geral do perfil: ${ov.nota_geral ?? '?'}/10.
Veredito: ${ov.veredito_curto || ''}
Público inferido: ${ov.publico_alvo_inferido || ''}

=== BIO ===
Bio ATUAL (literal): "${p.bio_text || '(vazia)'}"
Diagnóstico da bio: ${bio.pontos_de_melhoria || ''}
Pontos fortes da bio: ${bio.pontos_fortes || ''}
Bio NOVA sugerida (literal): "${bio.bio_sugerida || ''}"
Keyword sugerida pro nome: ${bio.sugestao_keyword_nome || ''}

=== MELHOR CONTEÚDO (maior engajamento) ===
${bloco(top)}

=== CONTEÚDO DE MENOR PERFORMANCE ===
${bloco(worst)}

=== OPORTUNIDADES ===
${(ov.oportunidades || []).map((o: any) => `- ${o.titulo}: ${o.racional}`).join('\n')}

Gere o script de teleprompter completo pro comercial conduzir essa análise ao vivo. Lembre: ele lê palavra por palavra e precisa soar especialista.`;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: ROTEIRO_SYSTEM },
        { role: 'user', content: userMsg },
      ],
      tools: [TOOL_ROTEIRO],
      tool_choice: { type: 'function', function: { name: 'gerar_roteiro_teleprompter' } },
      max_tokens: 4500,
      temperature: 0.7,
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI roteiro ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const j = await resp.json();
  const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error('roteiro: sem tool_call');
  return JSON.parse(args);
}
