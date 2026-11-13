// Conferência de acesso às áreas de membros da Hotmart (Club API, só leitura).
// Usado pelo acesso-areas-worker (monitor/cobrança 8h) e pelo acesso-apps-worker (conferência das vendas do #vendas).
// Cada área tem a versão NOVA (conta instituto) e a ANTIGA (conta pinguim). Parte do time ainda libera os
// mentorados nas antigas (achado 12/11: Kmila e Roberta só estavam no Elo antigo "ciclo-obpmaz") → qualquer uma vale.
import { getChave } from './cofre.ts';

export const AREA_NOME: Record<string, string> = { proalt: 'ProAlt', elo: 'Elo' };
export const AREA_CLUBS: Record<string, [string, string][]> = {
  proalt: [['proaltprogramaaceleracaolowtic', 'HOTMART_BASIC_TOKEN_INSTITUTO'], ['proalt', 'HOTMART_BASIC_TOKEN'], ['proaltlowticketrecorrente', 'HOTMART_BASIC_TOKEN']],
  elo: [['comunidadeelocriadoresdeconteu', 'HOTMART_BASIC_TOKEN_INSTITUTO'], ['ciclo-obpmaz', 'HOTMART_BASIC_TOKEN']],
};

// "@icloud.com.br", "@gmail.com.br" não existem: é erro de digitação do anúncio → tira o ".br"
export const normEmail = (e: string) => String(e || '').trim().toLowerCase().replace(/[.,;:)\]]+$/, '')
  .replace(/@(gmail|icloud|outlook|live|msn|me)\.com\.br$/, '@$1.com'); // hotmail.com.br e yahoo.com.br existem: não mexe

const _tok: Record<string, string> = {};
async function tokenHotmart(chave: string, consumidor: string) {
  if (_tok[chave]) return _tok[chave];
  const basic = await getChave(chave, consumidor);
  const r = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials', { method: 'POST', headers: { Authorization: `Basic ${basic}` } });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Hotmart: não autenticou (${chave})`);
  return (_tok[chave] = j.access_token);
}

// e-mails do mesmo aluno no CRM (o acesso pode estar em outro e-mail dele). sb = client no schema pinguim
export async function emailsDoAluno(sb: any, email: string): Promise<string[]> {
  const { data: idn } = await sb.from('crm_cliente_identidade').select('cliente_id').eq('tipo', 'email').eq('valor', email).limit(1);
  if (!idn?.[0]) return [email];
  const { data } = await sb.from('crm_cliente_identidade').select('valor').eq('tipo', 'email').eq('cliente_id', idn[0].cliente_id);
  return [...new Set([email, ...(data || []).map((x: any) => normEmail(x.valor))])];
}

// quais áreas (das pedidas) a pessoa JÁ tem ativas — em qualquer versão da área e em qualquer e-mail dela
export async function areasAtivas(sb: any, email: string, areas: string[], consumidor: string): Promise<string[]> {
  const emails = await emailsDoAluno(sb, email), ok: string[] = [];
  for (const a of areas) {
    achou: for (const [sub, chave] of AREA_CLUBS[a] || []) {
      const tok = await tokenHotmart(chave, consumidor);
      for (const e of emails) {
        const r = await fetch(`https://developers.hotmart.com/club/api/v1/users?subdomain=${sub}&email=${encodeURIComponent(e)}`, { headers: { Authorization: `Bearer ${tok}` } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(`Hotmart Club ${sub} ${r.status}`);
        const it = Array.isArray(j.items) ? j.items : [];
        if (it.some((u: any) => normEmail(u.email) === e && u.status === 'ACTIVE')) { ok.push(a); break achou; }
      }
    }
  }
  return ok;
}
