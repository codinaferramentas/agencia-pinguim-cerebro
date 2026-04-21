/**
 * Parser de export bruto do WhatsApp.
 *
 * Formatos suportados (WhatsApp export padrão em português):
 *   [21/04/26, 14:32:05] Luiz Fernando: Galera, lembra do que a Maria…
 *   21/04/26 14:32 - Luiz Fernando: Galera...
 *
 * Em vez de virar 1 fonte gigante, cada "conversa relevante" vira 1 fonte.
 * Conversa relevante = sequência de mensagens próximas no tempo (janela de 5 min)
 * com pelo menos 1 mensagem substancial (>= 20 palavras).
 *
 * Mensagens "ruído" (figurinhas, audios sem transcrição, mídia omitida) são
 * descartadas, mas contadas no metadata.
 */

const LINE_RE_1 = /^\[(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\]\s+([^:]+):\s?(.*)$/;
const LINE_RE_2 = /^(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+-\s+([^:]+):\s?(.*)$/;

const RUIDOS = [
  /<mídia oculta>/i,
  /<media omitted>/i,
  /você apagou esta mensagem/i,
  /esta mensagem foi apagada/i,
  /message was deleted/i,
  /áudio omitido/i,
  /vídeo omitido/i,
  /imagem omitida/i,
  /figurinha omitida/i,
  /sticker omitted/i,
];

export function parseWhatsApp(texto) {
  const linhas = texto.split('\n');
  const mensagens = [];
  let atual = null;
  let ruidoCount = 0;

  for (const linha of linhas) {
    const m = linha.match(LINE_RE_1) || linha.match(LINE_RE_2);
    if (m) {
      if (atual) mensagens.push(atual);
      const [_, data, hora, autor, texto_msg] = m;
      atual = {
        data: parseData(data, hora),
        autor: autor.trim(),
        texto: texto_msg || '',
      };
    } else if (atual) {
      // continuação (linha quebrada)
      atual.texto += '\n' + linha;
    }
  }
  if (atual) mensagens.push(atual);

  // filtrar ruídos
  const limpas = mensagens.filter(m => {
    if (!m.texto || !m.texto.trim()) return false;
    if (RUIDOS.some(re => re.test(m.texto))) {
      ruidoCount++;
      return false;
    }
    return true;
  });

  // agrupar em "conversas" por janela de 5 min
  const conversas = [];
  let conv = null;
  for (const msg of limpas) {
    if (!conv) {
      conv = { inicio: msg.data, fim: msg.data, mensagens: [msg], autores: new Set([msg.autor]) };
    } else {
      const delta = (msg.data - conv.fim) / 60000; // minutos
      if (delta <= 5) {
        conv.mensagens.push(msg);
        conv.autores.add(msg.autor);
        conv.fim = msg.data;
      } else {
        conversas.push(conv);
        conv = { inicio: msg.data, fim: msg.data, mensagens: [msg], autores: new Set([msg.autor]) };
      }
    }
  }
  if (conv) conversas.push(conv);

  // filtrar conversas relevantes: pelo menos 1 msg com >=15 palavras OU total >=40
  const relevantes = conversas.filter(c => {
    const totalPalavras = c.mensagens.reduce((s, m) => s + m.texto.split(/\s+/).length, 0);
    const temSubstancia = c.mensagens.some(m => m.texto.split(/\s+/).length >= 15);
    return temSubstancia || totalPalavras >= 40;
  });

  return {
    total_mensagens: mensagens.length,
    mensagens_limpas: limpas.length,
    ruido_descartado: ruidoCount,
    conversas_relevantes: relevantes.length,
    conversas: relevantes.map((c, i) => ({
      index: i,
      inicio: c.inicio?.toISOString() || null,
      fim: c.fim?.toISOString() || null,
      autores: [...c.autores],
      total_mensagens: c.mensagens.length,
      titulo: gerarTitulo(c),
      markdown: renderMarkdown(c),
    })),
  };
}

function parseData(data, hora) {
  // aceita dd/mm/aa ou dd/mm/aaaa
  const partes = data.split(/[\/\.]/);
  let [d, m, y] = partes.map(x => parseInt(x, 10));
  if (y < 100) y = 2000 + y;
  const [hh, mm, ss] = hora.split(':').map(x => parseInt(x, 10));
  try {
    return new Date(y, m - 1, d, hh, mm, ss || 0);
  } catch {
    return new Date();
  }
}

function gerarTitulo(conv) {
  const primeira = conv.mensagens[0];
  const palavras = primeira.texto.split(/\s+/).slice(0, 10).join(' ');
  const data = primeira.data ? primeira.data.toLocaleDateString('pt-BR') : '—';
  return `[${data}] ${primeira.autor}: ${palavras}${palavras.length < primeira.texto.length ? '…' : ''}`;
}

function renderMarkdown(conv) {
  return conv.mensagens.map(m => {
    const data = m.data ? m.data.toLocaleString('pt-BR') : '';
    return `**${m.autor}** _(${data})_\n${m.texto.trim()}`;
  }).join('\n\n');
}
