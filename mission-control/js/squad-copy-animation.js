/* Mission Control — Squad Copy Animation Engine
   Salão dos Mestres — animação dedicada ao pipeline criativo de copy.
   Diferente da squad-animation principal (que tem 6 departamentos Pinguim),
   este cenário é UM salão de 3 zonas sutilmente separadas (sem paredes):
   - Zona ALTA: parede com 4 fontes vivas (Cérebro/Persona/Skill/Funil) + headline + quadro do Pinguim
   - Zona MEIO: 4 mesas dos mestres em linha (Halbert/Schwartz/Bencivenga/Hormozi)
   - Zona BAIXA: mesa central do Atendente Pinguim + ambiente (planta, café, quadro de pedidos)

   Os mestres SÃO a 5ª fonte viva (Clones) — entram em pessoa quando convocados.

   Motor próprio (mais enxuto que squad-animation.js): sem idle decorativo,
   sem conversas, sem rooms, sem dim/highlight. Foco no roteiro paralelo.

   3 faixas de piso (cor sutilmente diferente) marcam as zonas:
   - 200..330 = madeira escura (zona das fontes vivas)
   - 330..470 = madeira clara (zona dos mestres)
   - 470..600 = carpete azul-escuro (zona do Atendente)
*/

const COL = {
  // Pisos por zona (3 faixas sutis)
  floorTop1: '#8b6a40', floorTop2: '#7a5b30', floorTopHi: '#a07d4f',     // madeira escura — fontes
  floorMid1: '#c9a574', floorMid2: '#b89160', floorMidHi: '#dcb888',     // madeira clara — mestres
  floorBot1: '#1f2a3e', floorBot2: '#1a2233', floorBotHi: '#2a3550',     // carpete azul — atendente
  // Faixa divisória entre zonas
  divisoria: '#3a2810',
  // Parede
  wall: '#2a2438', wallTop: '#3a3450', wallShadow: '#1a1428',
  shadow: 'rgba(0,0,0,0.35)',
  paper: '#f5f5dc', paperEdge: '#d4c89c',
  woodDark: '#5a371c', wood: '#8b5a30', woodHi: '#a67c4a',
  acentoPinguim: '#E85C00',
};

// ============================== MESAS DOS MESTRES ==============================
// 4 mesas alinhadas no centro do salão. Cada mestre tem sua "estação".
const MESAS_MESTRES = [
  { id: 'halbert',    nome: 'HALBERT',    x: 180, y: 380, accent: '#dc2626' },
  { id: 'schwartz',   nome: 'SCHWARTZ',   x: 380, y: 380, accent: '#475569' },
  { id: 'bencivenga', nome: 'BENCIVENGA', x: 580, y: 380, accent: '#2563eb' },
  { id: 'hormozi',    nome: 'HORMOZI',    x: 780, y: 380, accent: '#0a0a0a' },
];

// ============================== FONTES VIVAS ==============================
// 4 fontes "objetos" na parede do fundo (5ª fonte = os Clones, que entram depois).
// Fontes maiores que antes (~1.6x) — mais legíveis e dão peso visual ao topo.
const FONTES = [
  { id: 'cerebro', nome: 'CÉREBRO', x: 150, y: 145, tipo: 'estante', emoji: '🧠' },
  { id: 'persona', nome: 'PERSONA', x: 380, y: 145, tipo: 'quadro',  emoji: '👤' },
  { id: 'skill',   nome: 'SKILL',   x: 600, y: 145, tipo: 'livro',   emoji: '🛠' },
  { id: 'funil',   nome: 'FUNIL',   x: 825, y: 145, tipo: 'mapa',    emoji: '🎯' },
];

// ============================== AGENTES ==============================
// Atendente Pinguim + 4 mestres. Mestres começam fora da tela (entram pela direita).
const AGENTES_DEF = [
  // Atendente — pinguim de fato (sprite especial)
  { id: 'atendente', nome: 'Atendente', papel: 'Pinguim · Orquestrador',
    tipoSprite: 'pinguim',
    home: { x: 480, y: 540 } },

  // Mestres — humanos, cada um com identidade visual própria
  { id: 'halbert',    nome: 'Halbert',    papel: 'Direct Mail · Lendário',
    tipoSprite: 'humano', skin: '#fcd7b6', shirt: '#ffffff', pants: '#1f2937', hair: '#3a1f0a',
    acessorio: 'charuto',
    home: { x: 180, y: 430 } },
  { id: 'schwartz',   nome: 'Schwartz',   papel: 'Breakthrough · 5 Stages',
    tipoSprite: 'humano', skin: '#e8b48a', shirt: '#475569', pants: '#1a1f2e', hair: '#1a0f08',
    acessorio: 'oculos',
    home: { x: 380, y: 430 } },
  { id: 'bencivenga', nome: 'Bencivenga', papel: 'Persuasão · Bullets',
    tipoSprite: 'humano', skin: '#fcd7b6', shirt: '#2563eb', pants: '#1f2937', hair: '#4a2a0a',
    acessorio: 'lapis',
    home: { x: 580, y: 430 } },
  { id: 'hormozi',    nome: 'Hormozi',    papel: 'Grand Slam Offer',
    tipoSprite: 'humano', skin: '#e8b48a', shirt: '#0a0a0a', pants: '#1f2937', hair: 'careca',
    acessorio: 'fone',
    home: { x: 780, y: 430 } },
];

// Posição de entrada dos mestres (fora da tela, à direita)
const POSICAO_ENTRADA = { x: 1020, y: 490 };

/* ============================== DESENHO DE CENÁRIO ============================== */

// Pinguim SVG (igual ao da squad-animation principal — coerência de marca)
let _pinguimImg = null;
let _pinguimReady = false;
function getPinguimImg() {
  if (_pinguimImg) return _pinguimImg;
  _pinguimImg = new Image();
  _pinguimImg.onload = () => { _pinguimReady = true; };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="180 0 700 880">
    <path d="M180 631.739L180.401 779.881L225.57 726.828L249.482 763.965L329.191 663.166L369.045 827.627L451.41 692.344L605.514 875.374L666.624 803.754L730.39 875.374C741.851 770.066 747.145 722.655 743.675 652.555C740.205 582.456 661.31 514.62 610.828 411.168L565.659 395.252L517.701 442.269L483.338 437.253L454.067 517.272C406.196 531.028 366 575.211 350.446 618.071L246.825 532.022L180 631.739Z" fill="#ffffff"/>
    <path d="M180 606.184C265.66 223.443 351.616 65.5948 610.828 143.254L820.727 132.644C640.285 232.762 586.139 294.369 608.218 395.252L565.659 381.233L515.177 429.736L477.98 424.431L446.46 504.978C396.911 526.453 374.103 544.107 347.789 594.198L246.825 506.662L180 606.184Z" fill="#ffffff"/>
  </svg>`;
  _pinguimImg.src = 'data:image/svg+xml;base64,' + btoa(svg);
  return _pinguimImg;
}

// 3 faixas de piso pra delimitar zonas sutilmente sem usar paredes:
// y 220..330 = madeira escura (zona alta — fontes vivas / parede de inspiração)
// y 330..470 = madeira clara (zona meio — mestres trabalhando)
// y 470..600 = carpete azul-escuro (zona baixa — Atendente Pinguim)
function drawFloor(ctx, W, H) {
  // ZONA ALTA — madeira escura
  for (let py = 220; py < 330; py += 18) {
    ctx.fillStyle = ((py / 18) % 2 === 0) ? COL.floorTop1 : COL.floorTop2;
    ctx.fillRect(0, py, W, 18);
    ctx.fillStyle = COL.floorTopHi;
    ctx.fillRect(0, py, W, 1);
    for (let px = 0; px < W; px += 80) {
      const offset = ((py / 18) % 2 === 0) ? 0 : 40;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(px + offset, py, 1, 18);
    }
  }
  // Faixa divisória 1 (madeira escura → clara) — tira de tom de transição
  ctx.fillStyle = COL.divisoria;
  ctx.fillRect(0, 328, W, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 330, W, 2);

  // ZONA MEIO — madeira clara
  for (let py = 332; py < 470; py += 18) {
    ctx.fillStyle = ((py / 18) % 2 === 0) ? COL.floorMid1 : COL.floorMid2;
    ctx.fillRect(0, py, W, 18);
    ctx.fillStyle = COL.floorMidHi;
    ctx.fillRect(0, py, W, 1);
    for (let px = 0; px < W; px += 80) {
      const offset = ((py / 18) % 2 === 0) ? 0 : 40;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(px + offset, py, 1, 18);
    }
  }
  // Faixa divisória 2 (madeira clara → carpete) — listra mais grossa, parece transição de piso
  ctx.fillStyle = COL.divisoria;
  ctx.fillRect(0, 468, W, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 470, W, 3);

  // ZONA BAIXA — carpete texturizado
  ctx.fillStyle = COL.floorBot1;
  ctx.fillRect(0, 473, W, H - 473);
  // Trama de carpete (pontilhado leve)
  for (let py = 473; py < H; py += 4) {
    for (let px = 0; px < W; px += 4) {
      if ((px + py) % 8 === 0) {
        ctx.fillStyle = COL.floorBot2;
        ctx.fillRect(px, py, 2, 2);
      }
    }
  }
  // Borda leve do carpete
  ctx.fillStyle = COL.floorBotHi;
  ctx.fillRect(0, 473, W, 1);
}

function drawWalls(ctx, W) {
  // Parede do fundo (até y=220) — agora maior pra acomodar headline + fontes maiores + quadro
  ctx.fillStyle = COL.wall;
  ctx.fillRect(0, 0, W, 220);
  // Topo da parede (clarinho — sanca)
  ctx.fillStyle = COL.wallTop;
  ctx.fillRect(0, 0, W, 8);
  // Linha de sombra entre parede e piso
  ctx.fillStyle = COL.wallShadow;
  ctx.fillRect(0, 215, W, 5);

  // Headline institucional no topo (igual squad-animation principal)
  drawHeadline(ctx, W);

  // Quadro do Pinguim na parede do fundo (canto direito alto)
  drawQuadroPinguim(ctx, W - 100, 80);

  // Adesivo/etiqueta lateral identificando a sala
  drawEtiquetaSalao(ctx, 60, 80);
}

function drawHeadline(ctx, W) {
  ctx.save();
  ctx.font = 'bold 12px -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = 'SALÃO DOS MESTRES · PIPELINE CRIATIVO PINGUIM';
  ctx.fillStyle = `rgba(232, 92, 0, 0.92)`;
  // Letterspacing manual (mais elegante)
  const chars = text.split('');
  const spacing = 1.4;
  const total = chars.reduce((s, c) => s + ctx.measureText(c).width + spacing, -spacing);
  let x = W / 2 - total / 2;
  const y = 16;
  chars.forEach(c => {
    const w = ctx.measureText(c).width;
    ctx.fillText(c, x + w / 2, y);
    x += w + spacing;
  });
  ctx.restore();

  // Linha decorativa abaixo
  ctx.fillStyle = 'rgba(232, 92, 0, 0.4)';
  ctx.fillRect(W / 2 - 100, 26, 200, 1);
}

function drawQuadroPinguim(ctx, cx, cy) {
  const w = 64;
  const h = 72;
  // Moldura escura
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
  // Highlight superior
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(cx - w / 2 + 2, cy - h / 2 + 2, w - 4, 2);
  // Pinguim dentro do quadro
  const img = getPinguimImg();
  if (_pinguimReady) {
    const pad = 8;
    ctx.drawImage(img, cx - w / 2 + pad, cy - h / 2 + pad, w - pad * 2, h - pad * 2);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();
  }
  // Plaquinha "Agência Pinguim" abaixo do quadro
  ctx.fillStyle = 'rgba(232, 92, 0, 0.85)';
  ctx.fillRect(cx - 36, cy + h / 2 + 4, 72, 12);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 8px -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AGÊNCIA PINGUIM', cx, cy + h / 2 + 12);
  ctx.textAlign = 'left';
}

function drawEtiquetaSalao(ctx, cx, cy) {
  // Adesivo rotativo lateral — "SALÃO 01"
  const w = 56, h = 56;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(cx - w / 2 + 2, cy - h / 2 + 2, w - 4, 2);
  // Conteúdo
  ctx.font = 'bold 9px -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#E85C00';
  ctx.fillText('SALÃO', cx, cy - 6);
  ctx.fillText('01', cx, cy + 5);
  ctx.fillStyle = 'rgba(232, 92, 0, 0.5)';
  ctx.fillRect(cx - 16, cy + 12, 32, 1);
  ctx.fillStyle = '#9ca3af';
  ctx.font = '7px -apple-system, "Segoe UI", sans-serif';
  ctx.fillText('mestres', cx, cy + 22);
  ctx.textAlign = 'left';
}

// Cada fonte viva tem visual próprio. ~1.5x maior que a versão inicial.
function drawFonte(ctx, fonte, gap, frame, ativa) {
  const { x, y, tipo, nome } = fonte;

  // Pulse amarelo se está ativa
  if (ativa) {
    const pulse = 0.5 + Math.sin(frame * 0.1) * 0.3;
    ctx.save();
    ctx.shadowColor = `rgba(251, 191, 36, ${pulse})`;
    ctx.shadowBlur = 24;
    ctx.strokeStyle = `rgba(251, 191, 36, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 56, y - 70, 112, 105);
    ctx.restore();
  }

  ctx.save();
  if (gap) ctx.globalAlpha = 0.45;

  if (tipo === 'estante') {
    // Cérebro = estante de livros (maior)
    ctx.fillStyle = COL.shadow; ctx.fillRect(x - 38, y + 32, 80, 6);
    ctx.fillStyle = COL.woodDark; ctx.fillRect(x - 40, y - 60, 80, 92);
    ctx.fillStyle = COL.wood; ctx.fillRect(x - 40, y - 60, 80, 4);
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(x - 38, y - 32, 76, 2);
    ctx.fillRect(x - 38, y - 5, 76, 2);
    ctx.fillRect(x - 38, y + 22, 76, 2);
    // Livros coloridos (3 prateleiras × 8 livros)
    const cores = ['#dc2626', '#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    for (let row = 0; row < 3; row++) {
      let bx = x - 37;
      for (let b = 0; b < 8; b++) {
        const bw = 7 + (b % 3);
        const bh = 22 + ((b + row) % 3) * 2;
        ctx.fillStyle = cores[(b + row * 3) % cores.length];
        ctx.fillRect(bx, y - 56 + row * 27, bw, bh);
        // Detalhe dourado em alguns livros (lombada)
        if ((b + row) % 4 === 0) {
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(bx, y - 56 + row * 27 + 8, bw, 1);
        }
        bx += bw + 1;
      }
    }
  } else if (tipo === 'quadro') {
    // Persona = retrato emoldurado (maior + mais detalhe)
    ctx.fillStyle = COL.shadow; ctx.fillRect(x - 36, y + 32, 76, 5);
    ctx.fillStyle = '#92602a'; ctx.fillRect(x - 38, y - 60, 78, 92);
    ctx.fillStyle = '#c08838'; ctx.fillRect(x - 38, y - 60, 78, 4);
    ctx.fillStyle = '#724a1a'; ctx.fillRect(x - 38, y + 28, 78, 4);
    // Detalhe de cantos
    ctx.fillStyle = '#daa54a';
    ctx.fillRect(x - 38, y - 60, 5, 5);
    ctx.fillRect(x + 33, y - 60, 5, 5);
    ctx.fillRect(x - 38, y + 27, 5, 5);
    ctx.fillRect(x + 33, y + 27, 5, 5);
    // Tela (creme)
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(x - 32, y - 54, 64, 80);
    // Silhueta — busto detalhado
    ctx.fillStyle = '#a78bfa';
    ctx.fillRect(x - 12, y - 32, 24, 12); // pescoço/colarinho
    ctx.fillStyle = '#fcd7b6';
    ctx.beginPath(); ctx.arc(x, y - 30, 13, 0, Math.PI * 2); ctx.fill(); // rosto
    ctx.fillStyle = '#3a1f0a';
    ctx.fillRect(x - 13, y - 42, 26, 8); // cabelo
    ctx.fillRect(x - 13, y - 42, 4, 12); // mecha lateral
    // Olhinhos
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(x - 5, y - 31, 2, 2);
    ctx.fillRect(x + 3, y - 31, 2, 2);
    // Sorriso
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(x - 3, y - 25, 6, 1);
    // Ombros (blusa roxa)
    ctx.fillStyle = '#7c3aed';
    ctx.fillRect(x - 22, y - 18, 44, 22);
    // Collar com gola
    ctx.fillStyle = '#a78bfa';
    ctx.fillRect(x - 6, y - 18, 12, 6);
  } else if (tipo === 'livro') {
    // Skill = livro grosso aberto sobre suporte (maior)
    ctx.fillStyle = COL.shadow; ctx.fillRect(x - 36, y + 32, 76, 5);
    // Suporte de livro
    ctx.fillStyle = COL.woodDark; ctx.fillRect(x - 36, y + 5, 72, 32);
    ctx.fillStyle = COL.wood; ctx.fillRect(x - 36, y + 5, 72, 3);
    ctx.fillStyle = '#3a2010'; ctx.fillRect(x - 36, y + 33, 72, 2);
    // Livro grosso aberto em cima do suporte
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(x - 34, y - 28, 68, 32);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x - 34, y - 28, 68, 3);
    ctx.fillStyle = '#92602a'; ctx.fillRect(x - 34, y - 28, 68, 2);
    // Páginas
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(x - 30, y - 24, 60, 26);
    // Linha central (lombada aberta)
    ctx.fillStyle = '#d4c89c';
    ctx.fillRect(x - 1, y - 24, 2, 26);
    // Linhas de texto (esquerda)
    ctx.fillStyle = '#6b7280';
    for (let i = 0; i < 6; i++) {
      const lw = 22 - (i % 3) * 3;
      ctx.fillRect(x - 28, y - 21 + i * 4, lw, 1);
    }
    // Linhas de texto (direita)
    for (let i = 0; i < 6; i++) {
      const lw = 22 - (i % 3) * 3;
      ctx.fillRect(x + 4, y - 21 + i * 4, lw, 1);
    }
    // Marcador vermelho
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x - 2, y - 30, 4, 38);
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(x - 2, y - 30, 4, 2);
  } else if (tipo === 'mapa') {
    // Funil = mapa/diagrama na parede (maior)
    ctx.fillStyle = COL.shadow; ctx.fillRect(x - 36, y + 32, 76, 5);
    // Moldura
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(x - 40, y - 60, 80, 92);
    ctx.fillStyle = '#374151';
    ctx.fillRect(x - 40, y - 60, 80, 4);
    ctx.fillStyle = '#0f1620';
    ctx.fillRect(x - 40, y + 28, 80, 4);
    // Papel
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(x - 34, y - 54, 68, 80);
    // Título "FUNIL"
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 8px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FUNIL ATIVO', x, y - 46);
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(x - 24, y - 42, 48, 1);
    // 3 caixas em funil invertido
    ctx.fillStyle = '#10b981';
    ctx.fillRect(x - 28, y - 36, 56, 16); // topo (largo)
    ctx.fillStyle = '#0a0a0a'; ctx.font = 'bold 7px sans-serif';
    ctx.fillText('TOPO', x, y - 27);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(x - 20, y - 16, 40, 16); // meio
    ctx.fillStyle = '#0a0a0a';
    ctx.fillText('MEIO', x, y - 7);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(x - 12, y + 4, 24, 16); // fundo
    ctx.fillStyle = '#0a0a0a';
    ctx.fillText('FUNDO', x, y + 13);
    // Setas pra baixo (pixel)
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(x - 1, y - 19, 2, 2);
    ctx.fillRect(x - 2, y - 18, 4, 1);
    ctx.fillRect(x - 1, y + 1, 2, 2);
    ctx.fillRect(x - 2, y + 2, 4, 1);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  // Label da fonte (logo abaixo, dentro da parede ainda)
  ctx.font = 'bold 12px -apple-system, "Segoe UI", sans-serif';
  const labelW = ctx.measureText(nome).width + 18;
  const lx = x - labelW / 2;
  const ly = y + 42;
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillRect(lx, ly, labelW, 18);
  ctx.fillStyle = gap ? '#ef4444' : '#fbbf24';
  ctx.fillRect(lx, ly, 4, 18);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(nome, x, ly + 13);
  ctx.textAlign = 'left';

  // Marca "GAP" se a fonte deu gap
  if (gap) {
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 11px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GAP', x, y - 70);
    ctx.textAlign = 'left';
  }
}

// Mesa de mestre (computador + cadeira + placa com nome)
function drawMesaMestre(ctx, mesa, ocupada, frame) {
  const { x, y, nome, accent } = mesa;

  // Mesa em si
  ctx.fillStyle = COL.shadow; ctx.fillRect(x - 32, y + 18, 68, 6);
  ctx.fillStyle = COL.wood; ctx.fillRect(x - 32, y - 4, 66, 22);
  ctx.fillStyle = COL.woodHi; ctx.fillRect(x - 32, y - 4, 66, 2);
  ctx.fillStyle = COL.woodDark; ctx.fillRect(x - 32, y + 16, 66, 2);
  // Pés
  ctx.fillStyle = '#3a2010';
  ctx.fillRect(x - 30, y + 18, 3, 8);
  ctx.fillRect(x + 27, y + 18, 3, 8);

  // Computador
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 14, y - 22, 28, 20);
  ctx.fillStyle = ocupada ? accent : '#2a2a2a';
  ctx.fillRect(x - 12, y - 20, 24, 16);
  // Tela ligada (se ocupada, muda cor pulsando)
  if (ocupada) {
    const pulse = 0.7 + Math.sin(frame * 0.15) * 0.3;
    ctx.fillStyle = `rgba(255,255,255,${pulse * 0.3})`;
    ctx.fillRect(x - 12, y - 20, 24, 16);
    // Linhas de "código"
    ctx.fillStyle = '#10b981';
    ctx.fillRect(x - 10, y - 17, 8, 1);
    ctx.fillRect(x - 10, y - 14, 14, 1);
    ctx.fillRect(x - 10, y - 11, 10, 1);
    ctx.fillRect(x - 10, y - 8, 16, 1);
  }
  // Base do monitor
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 4, y - 4, 8, 4);
  ctx.fillRect(x - 8, y, 16, 2);
  // Teclado
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x - 14, y + 4, 28, 4);

  // Placa com nome
  ctx.font = 'bold 10px -apple-system, "Segoe UI", sans-serif';
  const labelW = ctx.measureText(nome).width + 14;
  const lx = x - labelW / 2;
  const ly = y + 30;
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(lx, ly, labelW, 14);
  ctx.fillStyle = accent; ctx.fillRect(lx, ly, 3, 14);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(nome, x, ly + 10);
  ctx.textAlign = 'left';
}

// Cadeira na mesa do mestre (atrás da mesa quando vazia, na mesa quando ocupada)
function drawCadeira(ctx, x, y, color) {
  ctx.fillStyle = COL.shadow; ctx.fillRect(x - 9, y + 14, 20, 4);
  ctx.fillStyle = color; ctx.fillRect(x - 9, y + 4, 18, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x - 9, y + 13, 18, 1);
  ctx.fillStyle = color; ctx.fillRect(x - 8, y - 8, 16, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x - 8, y - 8, 16, 2);
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x - 2, y + 14, 4, 3);
}

// Mesa central do Atendente
function drawMesaAtendente(ctx, x, y) {
  // Mesa um pouco maior — recepção/orquestração
  ctx.fillStyle = COL.shadow; ctx.fillRect(x - 56, y + 22, 116, 7);
  ctx.fillStyle = COL.woodDark; ctx.fillRect(x - 56, y - 4, 112, 26);
  ctx.fillStyle = COL.wood; ctx.fillRect(x - 56, y - 4, 112, 3);
  ctx.fillStyle = '#3a2010';
  ctx.fillRect(x - 54, y + 22, 4, 8);
  ctx.fillRect(x + 50, y + 22, 4, 8);
  // Frente da mesa — placa com logo Pinguim
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(x - 28, y + 5, 56, 16);
  ctx.fillStyle = COL.acentoPinguim;
  ctx.fillRect(x - 28, y + 5, 56, 2);
  // Pequeno pinguim no logo (placeholder simplificado)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 22, y + 9, 8, 10);
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(x - 22, y + 9, 8, 4); // cabeça preta
  ctx.fillStyle = COL.acentoPinguim;
  ctx.fillRect(x - 19, y + 12, 2, 1); // bico
  // Texto "AGÊNCIA PINGUIM"
  ctx.font = 'bold 7px -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = COL.acentoPinguim;
  ctx.textAlign = 'left';
  ctx.fillText('AGÊNCIA', x - 12, y + 13);
  ctx.fillText('PINGUIM', x - 12, y + 20);
  ctx.textAlign = 'left';
  // Papéis empilhados (canto esquerdo do tampo)
  ctx.fillStyle = COL.paper; ctx.fillRect(x - 50, y - 2, 14, 6);
  ctx.fillStyle = COL.paperEdge; ctx.fillRect(x - 50, y - 2, 14, 1);
  ctx.fillStyle = '#6b7280'; ctx.fillRect(x - 48, y, 10, 1); ctx.fillRect(x - 48, y + 2, 8, 1);
  // Caneca de café no canto direito
  drawCafe(ctx, x + 38, y - 2);
  // Computador discreto no fundo direito
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x + 18, y - 12, 18, 10);
  ctx.fillStyle = '#10b981';
  ctx.fillRect(x + 19, y - 11, 16, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(x + 20, y - 10, 8, 1);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x + 25, y - 2, 4, 2);
}

function drawCafe(ctx, x, y) {
  // Caneca laranja com vapor leve
  ctx.fillStyle = COL.shadow; ctx.fillRect(x - 4, y + 8, 10, 2);
  ctx.fillStyle = '#E85C00'; ctx.fillRect(x - 4, y, 8, 8);
  ctx.fillStyle = '#ff7530'; ctx.fillRect(x - 4, y, 8, 2);
  // Alça
  ctx.fillStyle = '#E85C00'; ctx.fillRect(x + 4, y + 2, 2, 4);
  // Café (visto de cima)
  ctx.fillStyle = '#3a1f0a'; ctx.fillRect(x - 3, y, 6, 1);
}

// Estante decorativa lateral — 3 prateleiras com livros, troféus, plantas
function drawEstanteDecorativa(ctx, x, y, accent) {
  ctx.fillStyle = COL.shadow; ctx.fillRect(x - 22, y + 60, 48, 7);
  ctx.fillStyle = COL.woodDark; ctx.fillRect(x - 24, y - 70, 48, 130);
  ctx.fillStyle = COL.wood; ctx.fillRect(x - 24, y - 70, 48, 3);
  // 3 prateleiras
  ctx.fillStyle = '#3a2010';
  ctx.fillRect(x - 22, y - 45, 44, 2);
  ctx.fillRect(x - 22, y - 15, 44, 2);
  ctx.fillRect(x - 22, y + 15, 44, 2);
  ctx.fillRect(x - 22, y + 45, 44, 2);
  // Prateleira 1: livros
  const cores = [accent, '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
  let bx = x - 21;
  for (let b = 0; b < 5; b++) {
    const bw = 7 + (b % 2);
    ctx.fillStyle = cores[b % cores.length];
    ctx.fillRect(bx, y - 65, bw, 18);
    bx += bw + 1;
  }
  // Prateleira 2: troféu pequeno + livro
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(x - 16, y - 38, 6, 16); // copa
  ctx.fillStyle = '#92602a';
  ctx.fillRect(x - 17, y - 22, 8, 4); // base
  // Livro deitado
  ctx.fillStyle = accent;
  ctx.fillRect(x - 4, y - 25, 22, 8);
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(x - 4, y - 24, 22, 1);
  // Prateleira 3: plantinha em vaso
  ctx.fillStyle = '#8b4513';
  ctx.fillRect(x - 6, y + 5, 12, 8);
  ctx.fillStyle = '#a0522d';
  ctx.fillRect(x - 6, y + 5, 12, 2);
  ctx.fillStyle = '#2d5a2d';
  ctx.fillRect(x - 5, y - 4, 4, 10);
  ctx.fillRect(x + 1, y - 6, 4, 12);
  ctx.fillStyle = '#4a8b3a';
  ctx.fillRect(x - 4, y - 2, 2, 6);
  // Prateleira 4: livros
  bx = x - 21;
  for (let b = 0; b < 4; b++) {
    const bw = 8 + (b % 2);
    ctx.fillStyle = cores[(b + 2) % cores.length];
    ctx.fillRect(bx, y + 22, bw, 20);
    bx += bw + 1;
  }
}

// Sofá baixo de 2 lugares (na zona do Atendente, lateral esquerda — recepção)
function drawSofa(ctx, x, y, color) {
  ctx.fillStyle = COL.shadow; ctx.fillRect(x - 38, y + 18, 78, 6);
  ctx.fillStyle = color; ctx.fillRect(x - 38, y, 76, 20);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 38, y + 17, 76, 3);
  ctx.fillStyle = color; ctx.fillRect(x - 38, y - 12, 76, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x - 38, y - 12, 76, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 1, y - 12, 2, 32);
  ctx.fillStyle = color; ctx.fillRect(x - 44, y - 10, 6, 30); ctx.fillRect(x + 38, y - 10, 6, 30);
  // Almofadas decorativas
  ctx.fillStyle = COL.acentoPinguim;
  ctx.fillRect(x - 28, y - 8, 12, 10);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(x + 16, y - 8, 12, 10);
}

// Plantinhas decorativas
function drawPlanta(ctx, x, y, size = 1) {
  const s = size;
  ctx.fillStyle = COL.shadow; ctx.fillRect(x - 8 * s, y + 12 * s, 18 * s, 4 * s);
  ctx.fillStyle = '#8b4513'; ctx.fillRect(x - 7 * s, y + 4 * s, 16 * s, 10 * s);
  ctx.fillStyle = '#a0522d'; ctx.fillRect(x - 7 * s, y + 4 * s, 16 * s, 2 * s);
  ctx.fillStyle = '#2d5a2d';
  ctx.fillRect(x - 10 * s, y - 8 * s, 4 * s, 14 * s);
  ctx.fillRect(x - 2 * s, y - 12 * s, 4 * s, 18 * s);
  ctx.fillRect(x + 6 * s, y - 6 * s, 4 * s, 12 * s);
  ctx.fillStyle = '#4a8b3a';
  ctx.fillRect(x - 9 * s, y - 6 * s, 2 * s, 8 * s);
  ctx.fillRect(x - 1 * s, y - 10 * s, 2 * s, 12 * s);
}

// Quadro de trabalhos (mostra pedido ativo)
function drawQuadroTrabalhos(ctx, x, y, pedidoTexto) {
  // Quadro
  ctx.fillStyle = COL.shadow; ctx.fillRect(x - 70, y + 50, 144, 5);
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(x - 72, y - 50, 144, 100);
  ctx.fillStyle = '#374151';
  ctx.fillRect(x - 72, y - 50, 144, 4);
  // Folha grudada
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(x - 66, y - 42, 132, 88);
  // Pino vermelho
  ctx.fillStyle = '#dc2626';
  ctx.beginPath(); ctx.arc(x, y - 38, 3, 0, Math.PI * 2); ctx.fill();
  // Header
  ctx.fillStyle = '#1f2937';
  ctx.font = 'bold 9px -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PEDIDO ATIVO', x, y - 25);
  ctx.textAlign = 'left';
  // Linha
  ctx.fillStyle = '#9ca3af';
  ctx.fillRect(x - 60, y - 20, 120, 1);
  // Texto do pedido (quebra em linhas)
  ctx.fillStyle = '#1f2937';
  ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
  const linhas = quebrarTexto(ctx, pedidoTexto, 120);
  linhas.slice(0, 6).forEach((linha, i) => {
    ctx.fillText(linha, x - 60, y - 8 + i * 11);
  });
}

function quebrarTexto(ctx, texto, larguraMax) {
  const palavras = texto.split(' ');
  const linhas = [];
  let linhaAtual = '';
  palavras.forEach(p => {
    const teste = linhaAtual ? linhaAtual + ' ' + p : p;
    if (ctx.measureText(teste).width > larguraMax && linhaAtual) {
      linhas.push(linhaAtual);
      linhaAtual = p;
    } else {
      linhaAtual = teste;
    }
  });
  if (linhaAtual) linhas.push(linhaAtual);
  return linhas;
}

/* ============================== SPRITES DE PERSONAGEM ============================== */

function drawPinguim(ctx, x, y, state, frame, direction) {
  const walkPhase = Math.floor(frame / 6) % 4;
  const walkBob = state === 'walking' ? [0, -1, 0, 1][walkPhase] : 0;
  const breathe = Math.sin(frame * 0.08) * 0.5;

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y + breathe));

  // Sombra
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(0, 22, 11, 3, 0, 0, Math.PI * 2); ctx.fill();

  // Pés laranjas
  ctx.fillStyle = '#fb923c';
  ctx.fillRect(-6, 18 + walkBob, 5, 3);
  ctx.fillRect(1, 18 + walkBob, 5, 3);

  // Corpo preto
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(-9, -2 + walkBob, 18, 22);
  // Barriga branca
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-6, 2 + walkBob, 12, 16);

  // Cabeça preta
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(-7, -14 + walkBob, 14, 14);
  // Bico laranja
  ctx.fillStyle = '#fb923c';
  if (direction === 'left') {
    ctx.fillRect(-9, -7 + walkBob, 4, 3);
  } else if (direction === 'right') {
    ctx.fillRect(5, -7 + walkBob, 4, 3);
  } else {
    ctx.fillRect(-2, -5 + walkBob, 4, 3);
  }

  // Olhos
  if (direction !== 'up') {
    ctx.fillStyle = '#ffffff';
    if (direction === 'left') {
      ctx.fillRect(-5, -10 + walkBob, 3, 3);
      ctx.fillRect(0, -10 + walkBob, 3, 3);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(-5, -10 + walkBob, 2, 3);
      ctx.fillRect(0, -10 + walkBob, 2, 3);
    } else if (direction === 'right') {
      ctx.fillRect(-3, -10 + walkBob, 3, 3);
      ctx.fillRect(2, -10 + walkBob, 3, 3);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(-1, -10 + walkBob, 2, 3);
      ctx.fillRect(4, -10 + walkBob, 2, 3);
    } else {
      ctx.fillRect(-4, -10 + walkBob, 3, 3);
      ctx.fillRect(1, -10 + walkBob, 3, 3);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(-3, -10 + walkBob, 2, 3);
      ctx.fillRect(2, -10 + walkBob, 2, 3);
    }
  }

  // Asas (movimento se walking)
  const asaOffset = state === 'walking' ? [0, 1, 0, -1][walkPhase] : 0;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(-11, 0 + walkBob + asaOffset, 3, 12);
  ctx.fillRect(8, 0 + walkBob - asaOffset, 3, 12);

  ctx.restore();

  // Tag com nome
  const tagY = y - 38;
  ctx.font = 'bold 11px -apple-system, "Segoe UI", sans-serif';
  const tagW = ctx.measureText('Atendente').width + 14;
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(x - tagW / 2, tagY, tagW, 15);
  ctx.fillStyle = '#E85C00';
  ctx.fillRect(x - tagW / 2, tagY + 13, tagW, 2);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('Atendente', x, tagY + 11);
  ctx.textAlign = 'left';
}

function drawHumano(ctx, x, y, agent, state, frame, direction, holdingPaper) {
  const walkPhase = Math.floor(frame / 6) % 4;
  const walkBob = state === 'walking' ? [0, -1, 0, 1][walkPhase] : 0;
  const legOffset = state === 'walking' ? [0, 2, 0, -2][walkPhase] : 0;
  const armSwing = state === 'walking' ? [0, 2, 0, -2][walkPhase] : 0;
  const breathe = state === 'working' ? Math.sin(frame * 0.1) * 0.5 : 0;
  const sitting = state === 'working' || state === 'sitting';

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y + (sitting ? -2 : 0) + breathe));

  // Sombra
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, 20, 10, 3, 0, 0, Math.PI * 2); ctx.fill();

  // Pernas
  ctx.fillStyle = agent.pants;
  if (sitting) {
    ctx.fillRect(-4, 8, 3, 6); ctx.fillRect(1, 8, 3, 6);
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(-4, 14, 3, 2); ctx.fillRect(1, 14, 3, 2);
  } else {
    ctx.fillRect(-4, 8 + walkBob, 3, 10 - Math.abs(legOffset));
    ctx.fillRect(1, 8 + walkBob, 3, 10 - Math.abs(legOffset));
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(-4, 17 + walkBob, 3, 2);
    ctx.fillRect(1, 17 + walkBob, 3, 2);
  }

  // Camisa
  ctx.fillStyle = agent.shirt;
  ctx.fillRect(-6, -4 + walkBob, 12, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(-6, -4 + walkBob, 12, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(-6, 6 + walkBob, 12, 2);

  // Braços
  ctx.fillStyle = agent.shirt;
  if (state === 'working') {
    ctx.fillRect(-8, -1, 3, 5); ctx.fillRect(5, -1, 3, 5);
    ctx.fillStyle = agent.skin; ctx.fillRect(-8, 4, 3, 2); ctx.fillRect(5, 4, 3, 2);
    if (Math.floor(frame / 8) % 2 === 0) {
      ctx.fillStyle = agent.skin; ctx.fillRect(-8, 3, 3, 1);
    }
  } else if (holdingPaper) {
    ctx.fillRect(-8, -2 + walkBob, 3, 6); ctx.fillRect(5, -2 + walkBob, 3, 6);
    ctx.fillStyle = agent.skin; ctx.fillRect(-8, 4 + walkBob, 3, 2); ctx.fillRect(5, 4 + walkBob, 3, 2);
    const px = -6, py = 4 + walkBob;
    ctx.fillStyle = COL.paper; ctx.fillRect(px, py, 12, 8);
    ctx.fillStyle = COL.paperEdge; ctx.fillRect(px, py, 12, 1);
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(px + 1, py + 2, 10, 1);
    ctx.fillRect(px + 1, py + 4, 7, 1);
    ctx.fillRect(px + 1, py + 6, 9, 1);
  } else {
    ctx.fillRect(-8, -2 + walkBob + armSwing, 3, 8);
    ctx.fillRect(5, -2 + walkBob - armSwing, 3, 8);
    ctx.fillStyle = agent.skin; ctx.fillRect(-8, 6 + walkBob + armSwing, 3, 2);
    ctx.fillRect(5, 6 + walkBob - armSwing, 3, 2);
  }

  // Cabeça
  ctx.fillStyle = agent.skin;
  ctx.fillRect(-5, -14 + walkBob, 10, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(3, -14 + walkBob, 2, 10);

  // Cabelo (Hormozi é careca)
  if (agent.hair === 'careca') {
    // Sem cabelo — só uma sombra leve no topo
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(-5, -14 + walkBob, 10, 2);
  } else {
    ctx.fillStyle = agent.hair;
    if (direction === 'up') {
      ctx.fillRect(-5, -14 + walkBob, 10, 7);
    } else {
      ctx.fillRect(-5, -14 + walkBob, 10, 4);
      ctx.fillRect(-5, -14 + walkBob, 2, 7);
      ctx.fillRect(3, -14 + walkBob, 2, 5);
    }
  }

  // Olhos
  if (direction !== 'up') {
    ctx.fillStyle = '#ffffff';
    if (direction === 'left') {
      ctx.fillRect(-3, -9 + walkBob, 2, 2); ctx.fillRect(0, -9 + walkBob, 2, 2);
      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(-3, -9 + walkBob, 1, 2); ctx.fillRect(0, -9 + walkBob, 1, 2);
    } else if (direction === 'right') {
      ctx.fillRect(-2, -9 + walkBob, 2, 2); ctx.fillRect(1, -9 + walkBob, 2, 2);
      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(-1, -9 + walkBob, 1, 2); ctx.fillRect(2, -9 + walkBob, 1, 2);
    } else {
      ctx.fillRect(-3, -9 + walkBob, 2, 2); ctx.fillRect(1, -9 + walkBob, 2, 2);
      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(-2, -9 + walkBob, 1, 2); ctx.fillRect(2, -9 + walkBob, 1, 2);
    }
    // Boca
    ctx.fillStyle = '#8b4513';
    if (state === 'working') ctx.fillRect(-1, -6 + walkBob, 2, 1);
    else ctx.fillRect(-2, -6 + walkBob, 4, 1);
  }

  // Acessório identitário
  if (agent.acessorio === 'charuto' && direction !== 'up' && !sitting) {
    // Charuto na boca — Halbert
    ctx.fillStyle = '#5a371c';
    ctx.fillRect(direction === 'right' ? 2 : -6, -6 + walkBob, 4, 1);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(direction === 'right' ? 5 : -7, -6 + walkBob, 1, 1);
  }
  if (agent.acessorio === 'oculos' && direction !== 'up') {
    // Óculos redondos — Schwartz
    ctx.fillStyle = '#0a0a0a';
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 1;
    ctx.strokeRect(-4, -10 + walkBob, 3, 3);
    ctx.strokeRect(1, -10 + walkBob, 3, 3);
    ctx.fillRect(-1, -9 + walkBob, 2, 1);
  }
  if (agent.acessorio === 'lapis') {
    // Lápis na orelha — Bencivenga
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(direction === 'left' ? -7 : 5, -12 + walkBob, 2, 4);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(direction === 'left' ? -7 : 5, -12 + walkBob, 2, 1);
  }
  if (agent.acessorio === 'fone' && direction !== 'up') {
    // Headset preto — Hormozi
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-6, -14 + walkBob, 12, 2);
    ctx.fillRect(-6, -14 + walkBob, 1, 4);
    ctx.fillRect(5, -14 + walkBob, 1, 4);
  }

  ctx.restore();

  // Tag com nome
  const tagY = y - 36;
  ctx.font = 'bold 11px -apple-system, "Segoe UI", sans-serif';
  const tagW = ctx.measureText(agent.nome).width + 14;
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(x - tagW / 2, tagY, tagW, 15);
  ctx.fillStyle = agent.shirt === '#ffffff' ? '#dc2626' : agent.shirt;
  ctx.fillRect(x - tagW / 2, tagY + 13, tagW, 2);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(agent.nome, x, tagY + 11);
  ctx.textAlign = 'left';

  // Bolinhas pulsantes "..." quando working
  if (state === 'working') {
    const bubX = x + 12;
    const bubY = y - 24 + Math.sin(frame * 0.15) * 1;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(bubX, bubY, 18, 10);
    const dotFrame = Math.floor(frame / 10) % 4;
    ctx.fillStyle = '#fbbf24';
    for (let i = 0; i < 3; i++) {
      if (i <= dotFrame) ctx.fillRect(bubX + 3 + i * 4, bubY + 4, 2, 2);
    }
  }
  if (state === 'done') {
    const chY = y - 24;
    ctx.fillStyle = '#10b981';
    ctx.beginPath(); ctx.arc(x + 12, chY, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 9, chY); ctx.lineTo(x + 11, chY + 2); ctx.lineTo(x + 15, chY - 2);
    ctx.stroke();
  }
}

function drawSpeechBubble(ctx, x, y, text) {
  ctx.font = 'bold 13px -apple-system, "Segoe UI", sans-serif';
  const padX = 10, padY = 6;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 24;
  const bx = x - w / 2;
  const by = y - 56;
  // Sombra
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(bx + 2, by + 2, w, h);
  // Balão
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bx, by, w, h);
  ctx.strokeStyle = '#0a0a0a';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, w, h);
  // Rabinho
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x - 6, by + h); ctx.lineTo(x + 6, by + h); ctx.lineTo(x, by + h + 7);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 6, by + h); ctx.lineTo(x, by + h + 7); ctx.lineTo(x + 6, by + h);
  ctx.stroke();
  // Texto
  ctx.fillStyle = '#0a0a0a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, by + h / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/* ============================== ENGINE ============================== */
export function criarEngineCopy(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height;

  // Estado dos agentes
  const agentState = {};
  AGENTES_DEF.forEach(a => {
    // Atendente começa em casa; mestres começam fora da tela
    const inicio = a.id === 'atendente' ? a.home : POSICAO_ENTRADA;
    agentState[a.id] = {
      x: inicio.x, y: inicio.y,
      targetX: inicio.x, targetY: inicio.y,
      waypoints: [],
      state: 'idle', direction: 'down',
      pendingState: null, holdingPaper: false,
      speechBubble: null, speechTimer: 0,
      visivel: a.id === 'atendente', // mestres começam invisíveis
    };
  });

  // Estado das fontes (gap por padrão = false; ativa = false)
  const fontesState = {};
  FONTES.forEach(f => { fontesState[f.id] = { gap: false, ativa: false }; });

  // Pedido ativo (texto pro quadro de trabalhos)
  let pedidoAtivo = '';

  let frame = 0;
  let floatingPapers = [];
  let rafId = null;
  let destroyed = false;

  function updateAgent(id) {
    const s = agentState[id];
    if (s.waypoints.length > 0 &&
        Math.abs(s.targetX - s.x) < 2 && Math.abs(s.targetY - s.y) < 2) {
      const next = s.waypoints.shift();
      s.targetX = next.x; s.targetY = next.y;
    }
    const dx = s.targetX - s.x;
    const dy = s.targetY - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 2) {
      const speed = 3.0;
      s.x += (dx / dist) * speed;
      s.y += (dy / dist) * speed;
      s.state = 'walking';
      if (Math.abs(dx) > Math.abs(dy) * 0.5) s.direction = dx > 0 ? 'right' : 'left';
      else s.direction = dy > 0 ? 'down' : 'up';
    } else if (s.state === 'walking' && s.waypoints.length === 0) {
      s.state = s.pendingState || 'idle';
      s.pendingState = null;
    }
    if (s.speechTimer > 0) s.speechTimer--;
  }

  function updateFloatingPapers() {
    floatingPapers = floatingPapers.filter(p => {
      p.progress += 0.02;
      return p.progress < 1;
    });
  }

  function drawFloatingPapers() {
    floatingPapers.forEach(p => {
      const t = p.progress;
      const x = p.x1 + (p.x2 - p.x1) * t;
      const y = p.y1 + (p.y2 - p.y1) * t - Math.sin(t * Math.PI) * 20;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(x, p.y1 + (p.y2 - p.y1) * t + 12, 6, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      const rot = Math.sin(frame * 0.2) * 0.1;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = COL.paper; ctx.fillRect(-6, -8, 12, 16);
      ctx.fillStyle = COL.paperEdge; ctx.fillRect(-6, -8, 12, 1);
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(-5, -5, 10, 1);
      ctx.fillRect(-5, -2, 8, 1);
      ctx.fillRect(-5, 1, 9, 1);
      ctx.fillRect(-5, 4, 7, 1);
      ctx.restore();
    });
  }

  function render() {
    if (destroyed) return;
    frame++;

    // Background
    drawFloor(ctx, W, H);
    drawWalls(ctx, W);

    // Fontes vivas (parede do fundo)
    FONTES.forEach(f => {
      const fs = fontesState[f.id];
      drawFonte(ctx, f, fs.gap, frame, fs.ativa);
    });

    // Estantes decorativas — laterais da zona dos mestres (preenche o vazio)
    drawEstanteDecorativa(ctx, 50, 380, '#dc2626');
    drawEstanteDecorativa(ctx, 910, 380, '#2563eb');

    // Plantas decorativas — laterais zona do Atendente
    drawPlanta(ctx, 90, 530, 1.1);
    drawPlanta(ctx, 870, 540, 1.0);

    // Sofá de espera (zona do Atendente, lateral esquerda) — vendedor da história
    drawSofa(ctx, 180, 540, '#3a4a5e');

    // Quadro de trabalhos (parede do fundo, lado direito alto — não no piso baixo)
    drawQuadroTrabalhos(ctx, 720, 540, pedidoAtivo || 'aguardando pedido');

    // Mesas dos mestres + cadeiras (ordem: cadeira primeiro, depois mesa por cima)
    MESAS_MESTRES.forEach(m => {
      const ag = AGENTES_DEF.find(a => a.id === m.id);
      const ocupada = agentState[m.id].state === 'working';
      drawCadeira(ctx, m.x, m.y + 30, ag ? ag.shirt : '#3a3a3a');
      drawMesaMestre(ctx, m, ocupada, frame);
    });

    // Mesa do Atendente — centro da zona baixa
    drawMesaAtendente(ctx, 480, 510);

    // Atualiza agentes
    AGENTES_DEF.forEach(a => updateAgent(a.id));
    updateFloatingPapers();
    drawFloatingPapers();

    // Desenha agentes (depth-sort por y)
    const sorted = [...AGENTES_DEF]
      .filter(a => agentState[a.id].visivel)
      .sort((a, b) => agentState[a.id].y - agentState[b.id].y);

    sorted.forEach(a => {
      const s = agentState[a.id];
      if (a.tipoSprite === 'pinguim') {
        drawPinguim(ctx, s.x, s.y, s.state, frame, s.direction);
      } else {
        drawHumano(ctx, s.x, s.y, a, s.state, frame, s.direction, s.holdingPaper);
      }
      if (s.speechTimer > 0 && s.speechBubble) {
        drawSpeechBubble(ctx, s.x, s.y, s.speechBubble);
      }
    });

    rafId = requestAnimationFrame(render);
  }

  // ============================== API PÚBLICA ==============================
  async function walkTo(agentId, tx, ty, endState) {
    const s = agentState[agentId];
    s.waypoints = [{ x: tx, y: ty }];
    s.targetX = tx; s.targetY = ty;
    s.pendingState = endState || 'idle';
    return new Promise(resolve => {
      const check = () => {
        if (destroyed) return resolve();
        if (s.waypoints.length === 0 &&
            Math.abs(s.targetX - s.x) < 3 && Math.abs(s.targetY - s.y) < 3) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }

  function say(agentId, text, duration) {
    if (!agentState[agentId]) return;
    agentState[agentId].speechBubble = text;
    agentState[agentId].speechTimer = duration || 120;
  }

  function throwPaper(fromId, toId) {
    const sf = agentState[fromId];
    const st = agentState[toId];
    if (!sf || !st) return;
    floatingPapers.push({ x1: sf.x, y1: sf.y - 4, x2: st.x, y2: st.y - 4, progress: 0 });
  }

  function setHolding(agentId, holding) {
    if (agentState[agentId]) agentState[agentId].holdingPaper = holding;
  }

  function setState(agentId, state) {
    if (agentState[agentId]) agentState[agentId].state = state;
  }

  function setVisivel(agentId, visivel) {
    if (agentState[agentId]) agentState[agentId].visivel = visivel;
  }

  function setFonteAtiva(fonteId, ativa) {
    if (fontesState[fonteId]) fontesState[fonteId].ativa = ativa;
  }

  function setFonteGap(fonteId, gap) {
    if (fontesState[fonteId]) fontesState[fonteId].gap = gap;
  }

  function setPedidoAtivo(texto) {
    pedidoAtivo = texto || '';
  }

  // Posição da mesa de cada mestre (pra roteiro saber pra onde mandar)
  function posMesa(mestreId) {
    const m = MESAS_MESTRES.find(x => x.id === mestreId);
    if (!m) return null;
    return { x: m.x, y: m.y + 30 }; // y da cadeira
  }

  // Posição de cada fonte (pra Atendente caminhar até)
  function posFonte(fonteId) {
    const f = FONTES.find(x => x.id === fonteId);
    if (!f) return null;
    return { x: f.x, y: 280 }; // zona alta (madeira escura), logo abaixo da fonte
  }

  render();

  return {
    walkTo, say, throwPaper, setHolding, setState,
    setVisivel, setFonteAtiva, setFonteGap, setPedidoAtivo,
    posMesa, posFonte,
    agentes: () => AGENTES_DEF.map(a => ({ id: a.id, nome: a.nome, papel: a.papel })),
    mestres: () => MESAS_MESTRES.map(m => m.id),
    fontes: () => FONTES.map(f => f.id),
    destroy: () => { destroyed = true; if (rafId) cancelAnimationFrame(rafId); },
  };
}

// Exporta também os defs pra modal popular UI lateral
export const COPY_AGENTES = AGENTES_DEF;
export const COPY_MESTRES = MESAS_MESTRES;
export const COPY_FONTES = FONTES;
