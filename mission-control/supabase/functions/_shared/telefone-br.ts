// Variantes de telefone BR pra busca em bancos com formato inconsistente.
//
// Problema real: cada produto (ProAlt, Elo, Sirius, Principia, Clint) grava o
// telefone num jeito — uns com "+", uns com DDI 55, uns com o "9" do celular,
// uns sem. Buscar com 1 formato unico nunca acha todo mundo.
//
// Solucao: a partir de qualquer input plausivel, geramos TODAS as variantes
// crediveis e deixamos o PostgREST procurar com OR. Risco zero (so leitura).
//
// Exemplos:
//   "31991386670"     → [31991386670, 5531991386670, 553191386670, 3191386670]
//   "+5571991952425"  → [71991952425, 5571991952425, 557199195245... wait NO
//                        — fix abaixo trata corretamente]
//   "1133224455"      → [1133224455, 551133224455]  (fixo, sem variante de "9")

/** Remove tudo que nao for digito. */
export function soDigitos(s: string): string {
  return String(s || '').replace(/\D/g, '');
}

/**
 * Gera variantes de busca pra um numero BR.
 * Retorna array DEDUPLICADO de strings de digitos puros.
 *
 * Detecta:
 *  - se eh celular (9 na 3a posicao do nacional ou 3a depois do DDD)
 *  - se ja tem DDI 55 ou nao
 *  - se eh fixo (10 digitos sem DDI) — nao gera variante "sem 9"
 *
 * Pra numeros nao-BR (DDI != 55 e nao se encaixa em fixo/celular BR), retorna
 * so o numero puro — nao tenta adivinhar.
 */
export function variantesTelefoneBR(input: string): string[] {
  const dig = soDigitos(input);
  if (!dig) return [];

  const out = new Set<string>();
  out.add(dig);

  let comDDI: string | null = null;
  let semDDI: string | null = null;

  if (dig.startsWith('55') && (dig.length === 12 || dig.length === 13)) {
    comDDI = dig;
    semDDI = dig.slice(2);
  } else if (dig.length === 10 || dig.length === 11) {
    semDDI = dig;
    comDDI = '55' + dig;
  } else {
    return [dig];
  }

  if (semDDI.length === 11 && semDDI[2] === '9') {
    const semNove = semDDI.slice(0, 2) + semDDI.slice(3);
    out.add(semNove);
    out.add('55' + semNove);
  } else if (semDDI.length === 10) {
    const dddIni = parseInt(semDDI.slice(2, 3), 10);
    if (dddIni >= 6 && dddIni <= 9) {
      const comNove = semDDI.slice(0, 2) + '9' + semDDI.slice(2);
      out.add(comNove);
      out.add('55' + comNove);
    }
  }

  out.add(semDDI);
  out.add(comDDI);

  return Array.from(out);
}

/**
 * Monta o fragmento PostgREST `or=(col.ilike.*v1*,col.ilike.*v2*,...)`
 * com URL encoding correto. Usa wildcard nos dois lados pra casar mesmo
 * quando a coluna tem "+" ou outro prefixo (ex: "+5531...").
 *
 * Pra usar com `or=` no PostgREST:
 *   const frag = orTelefonePostgrest('phone', variantes);
 *   const url = `${base}/rest/v1/profiles?select=*&${frag}&limit=10`;
 */
export function orTelefonePostgrest(coluna: string, variantes: string[]): string {
  if (!variantes.length) return '';
  const partes = variantes.map(v => `${coluna}.ilike.*${v}*`);
  return `or=(${encodeURIComponent(partes.join(','))})`;
}

/**
 * Variante: devolve so o conteudo INTERNO de um or=(...), util quando o
 * caller ja tem outras condicoes pra juntar no mesmo or= (ex: email + nome
 * + telefone). Sem URL encoding — o caller eh responsavel por encodar.
 *
 * Ex: orTelefoneTermos('phone', ['111','222']) → 'phone.ilike.*111*,phone.ilike.*222*'
 */
export function orTelefoneTermos(coluna: string, variantes: string[]): string {
  if (!variantes.length) return '';
  return variantes.map(v => `${coluna}.ilike.*${v}*`).join(',');
}
