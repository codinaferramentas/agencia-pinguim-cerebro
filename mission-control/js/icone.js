/* Icone — cascata de fallback pra Cerebros (e qualquer objeto com nome+emoji+icone_url)
   Prioridade:
     1. icone_url (imagem subida)  → <img>
     2. emoji                       → texto
     3. inicial do nome             → letra em circulo
   API:
     iconeNode(obj, opts) → HTMLElement
     iconeHTML(obj, opts) → string (pra montar dentro de innerHTML)
*/

const TAMANHOS = {
  sm: 24,
  md: 36,
  lg: 48,
  xl: 64,
};

function tamanhoPx(t) {
  if (typeof t === 'number') return t;
  return TAMANHOS[t] || TAMANHOS.md;
}

function inicialDe(nome) {
  if (!nome) return '?';
  const limpo = String(nome).trim();
  if (!limpo) return '?';
  return limpo[0].toUpperCase();
}

/* Cria elemento DOM pronto pra inserir.
   obj: { icone_url?, emoji?, nome }
   opts: { size: 'sm'|'md'|'lg'|'xl'|number, className?: string }
*/
export function iconeNode(obj, opts = {}) {
  const px = tamanhoPx(opts.size || 'md');
  const cls = `icone icone-${typeof opts.size === 'string' ? opts.size : 'md'}` + (opts.className ? ` ${opts.className}` : '');

  const wrap = document.createElement('div');
  wrap.className = cls;
  wrap.style.width = px + 'px';
  wrap.style.height = px + 'px';

  if (obj?.icone_url) {
    const img = document.createElement('img');
    img.src = obj.icone_url;
    img.alt = obj.nome || '';
    img.loading = 'lazy';
    img.onerror = () => {
      // Se imagem falhar, cai pro emoji/inicial sem quebrar
      img.remove();
      wrap.appendChild(criarFallback(obj, px));
    };
    wrap.appendChild(img);
    wrap.classList.add('icone-img');
    return wrap;
  }

  wrap.appendChild(criarFallback(obj, px));
  return wrap;
}

function criarFallback(obj, px) {
  if (obj?.emoji) {
    const span = document.createElement('span');
    span.className = 'icone-emoji';
    span.textContent = obj.emoji;
    span.style.fontSize = Math.round(px * 0.6) + 'px';
    return span;
  }
  const span = document.createElement('span');
  span.className = 'icone-inicial';
  span.textContent = inicialDe(obj?.nome);
  span.style.fontSize = Math.round(px * 0.5) + 'px';
  return span;
}
