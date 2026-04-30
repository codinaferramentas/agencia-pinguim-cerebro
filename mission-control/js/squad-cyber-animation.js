/* Mission Control — Squad Animation Engine
   Motor canvas 2D puro, zero dependencia. Portado de demo-squad-agentes-pixel-v3.
   Uso: rodarAnimacao({ roteiro, apiCall, onComplete, onError })
*/

const C = {
  floorWood1: '#6b4423', floorWood2: '#5a371c', floorWoodHi: '#8b5a30',
  floorCarpet1: '#2d4a6b', floorCarpet2: '#1f3a5a',
  floorTile1: '#d4d4d8', floorTile2: '#a1a1aa',
  floorGreen1: '#4a6b3e', floorGreen2: '#3a5b2e',
  wallDark: '#1a1f2e', wallMid: '#2a3040', wallLight: '#3a4054', wallShadow: '#0f1420',
  shadow: 'rgba(0,0,0,0.35)',
  paper: '#f5f5dc', paperEdge: '#d4c89c',
};

// Squad Cyber Pinguim — 3 salas dedicadas a seguranca operacional.
// Layout: 3 salas lado a lado horizontalmente, altura cheia.
// Cada sala tem 2 agentes brasileiros que atuam em paralelo.
const ROOMS = [
  { id: 'central-ops',  name: 'CENTRAL DE OPERAÇÕES', x: 20,  y: 40, w: 300, h: 520, floor: 'tile',   color: '#3b82f6' },
  { id: 'oficina-inov', name: 'OFICINA DE INOVAÇÃO',  x: 340, y: 40, w: 300, h: 520, floor: 'carpet', color: '#ef4444' },
  { id: 'guarita',      name: 'GUARITA DO COFRE',     x: 660, y: 40, w: 300, h: 520, floor: 'wood',   color: '#10b981' },
];

// Squad Cyber Pinguim — 6 agentes brasileiros, 2 por sala.
// Sala 'central-ops':  Vega + Lupa  (logs + threat intel + IDS)
// Sala 'oficina-inov': Kira + Trava (red team + pentest)
// Sala 'guarita':      Cifra + Selo (secure coding + zero trust)
// Cada agente tem nome BR, esta inspirado num clone real da squad cybersecurity:
//   Ingrid -> Marcus Carey (Threat Intel)
//   Fernanda -> Chris Sanders (IDS)
//   Bejairo -> Peter Kim (Red Team / Hacker Playbook)
//   Rafael -> Georgia Weidman (Pentest)
//   Tati -> Jim Manico (OWASP / Secure Coding)
//   Dom -> Omar Santos (Cisco / Zero Trust)
const AGENTS_DEF = [
  // ---- CENTRAL DE OPERACOES ----
  { id: 'ingrid',   name: 'Ingrid',   role: 'Threat Intel · Centro de Ops',  emoji: '🎯', roomId: 'central-ops',
    skin: '#fcd7b6', shirt: '#3b82f6', pants: '#1f2937', hair: '#3a1f0a',
    desk: { x: 100, y: 180 }, chair: { x: 100, y: 210 }, home: { x: 100, y: 240 } },
  { id: 'fernanda', name: 'Fernanda', role: 'IDS · Centro de Ops',           emoji: '👁', roomId: 'central-ops',
    skin: '#fcd7b6', shirt: '#06b6d4', pants: '#1f2937', hair: '#c05050',
    desk: { x: 220, y: 180 }, chair: { x: 220, y: 210 }, home: { x: 220, y: 380 } },
  // ---- OFICINA DE INOVACAO ----
  { id: 'bejairo',  name: 'Bejairo',  role: 'Red Team · Oficina',            emoji: '🛡', roomId: 'oficina-inov',
    skin: '#d4a07a', shirt: '#ef4444', pants: '#1f2937', hair: '#1a0f08',
    desk: { x: 420, y: 180 }, chair: { x: 420, y: 210 }, home: { x: 420, y: 240 } },
  { id: 'rafael',   name: 'Rafael',   role: 'Pentest · Oficina',             emoji: '🔓', roomId: 'oficina-inov',
    skin: '#e8b48a', shirt: '#f59e0b', pants: '#1f2937', hair: '#2a1a0a',
    desk: { x: 540, y: 180 }, chair: { x: 540, y: 210 }, home: { x: 540, y: 380 } },
  // ---- GUARITA DO COFRE ----
  { id: 'tati',     name: 'Tati',     role: 'Secure Coding · Guarita',       emoji: '🔐', roomId: 'guarita',
    skin: '#fcd7b6', shirt: '#10b981', pants: '#1f2937', hair: '#3a1f0a',
    desk: { x: 740, y: 180 }, chair: { x: 740, y: 210 }, home: { x: 740, y: 240 } },
  { id: 'dom',      name: 'Dom',      role: 'Zero Trust · Guarita',          emoji: '⚔', roomId: 'guarita',
    skin: '#d4a07a', shirt: '#a855f7', pants: '#1f2937', hair: '#0a0a0a',
    desk: { x: 860, y: 180 }, chair: { x: 860, y: 210 }, home: { x: 860, y: 380 } },
];

/* ============================== FLOOR / WALLS / FURNITURE ============================== */
function drawFloor(ctx, room) {
  const { x, y, w, h, floor } = room;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (floor === 'wood') {
    for (let py = y; py < y + h; py += 16) {
      ctx.fillStyle = ((py / 16) % 2 === 0) ? C.floorWood1 : C.floorWood2;
      ctx.fillRect(x, py, w, 16);
      ctx.fillStyle = C.floorWoodHi;
      ctx.fillRect(x, py, w, 1);
      for (let px = x; px < x + w; px += 64) {
        const offset = ((py / 16) % 2 === 0) ? 0 : 32;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(px + offset, py, 1, 16);
      }
    }
  } else if (floor === 'carpet') {
    ctx.fillStyle = C.floorCarpet1; ctx.fillRect(x, y, w, h);
    for (let py = y; py < y + h; py += 4) {
      for (let px = x; px < x + w; px += 4) {
        if ((px + py) % 8 === 0) { ctx.fillStyle = C.floorCarpet2; ctx.fillRect(px, py, 2, 2); }
      }
    }
  } else if (floor === 'tile') {
    for (let py = y; py < y + h; py += 24) {
      for (let px = x; px < x + w; px += 24) {
        ctx.fillStyle = (((px + py) / 24) % 2 === 0) ? C.floorTile1 : C.floorTile2;
        ctx.fillRect(px, py, 24, 24);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(px + 23, py, 1, 24); ctx.fillRect(px, py + 23, 24, 1);
      }
    }
  } else if (floor === 'green') {
    ctx.fillStyle = C.floorGreen1; ctx.fillRect(x, y, w, h);
    for (let py = y; py < y + h; py += 6) {
      for (let px = x; px < x + w; px += 6) {
        if ((px + py) % 12 === 0) { ctx.fillStyle = C.floorGreen2; ctx.fillRect(px, py, 3, 3); }
      }
    }
  }
  ctx.restore();
}

function drawWalls(ctx, room) {
  const { x, y, w, h, color, name } = room;
  ctx.fillStyle = C.wallDark; ctx.fillRect(x - 3, y - 14, w + 6, 14);
  ctx.fillStyle = C.wallMid; ctx.fillRect(x - 3, y - 14, w + 6, 3);
  ctx.fillStyle = C.wallShadow; ctx.fillRect(x - 3, y - 1, w + 6, 2);
  ctx.fillStyle = C.wallDark;
  ctx.fillRect(x - 3, y, 3, h); ctx.fillRect(x + w, y, 3, h); ctx.fillRect(x - 3, y + h, w + 6, 3);
  ctx.fillStyle = color; ctx.fillRect(x - 3, y - 14, w + 6, 2);
  ctx.font = 'bold 13px -apple-system, "Segoe UI", sans-serif';
  const labelW = ctx.measureText(name).width + 18;
  ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(x + 8, y + 4, labelW, 20);
  ctx.fillStyle = color; ctx.fillRect(x + 8, y + 4, 3, 20);
  ctx.fillStyle = '#ffffff'; ctx.fillText(name, x + 16, y + 18);
}

function drawDesk(ctx, x, y, accent) {
  ctx.fillStyle = C.shadow; ctx.fillRect(x - 26, y + 16, 56, 8);
  ctx.fillStyle = '#8b5a30'; ctx.fillRect(x - 26, y - 2, 54, 18);
  ctx.fillStyle = '#a67c4a'; ctx.fillRect(x - 26, y - 2, 54, 2);
  ctx.fillStyle = '#5a371c'; ctx.fillRect(x - 26, y + 14, 54, 2);
  ctx.fillStyle = '#3a2010'; ctx.fillRect(x - 24, y + 16, 3, 6); ctx.fillRect(x + 23, y + 16, 3, 6);
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x - 12, y - 20, 24, 18);
  ctx.fillStyle = accent; ctx.fillRect(x - 10, y - 18, 20, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x - 10, y - 18, 20, 2);
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x - 2, y - 3, 4, 4); ctx.fillRect(x - 6, y, 12, 2);
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x - 14, y + 6, 28, 4);
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x + 16, y + 7, 4, 3);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 22, y + 2, 6, 6);
  ctx.fillStyle = accent; ctx.fillRect(x - 21, y + 3, 4, 1);
}
function drawChair(ctx, x, y, color) {
  ctx.fillStyle = C.shadow; ctx.fillRect(x - 8, y + 12, 18, 4);
  ctx.fillStyle = color; ctx.fillRect(x - 8, y + 4, 16, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x - 8, y + 11, 16, 1);
  ctx.fillStyle = color; ctx.fillRect(x - 7, y - 6, 14, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x - 7, y - 6, 14, 2);
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x - 2, y + 12, 4, 3);
}
function drawSofa(ctx, x, y, color) {
  ctx.fillStyle = C.shadow; ctx.fillRect(x - 38, y + 18, 78, 6);
  ctx.fillStyle = color; ctx.fillRect(x - 38, y, 76, 20);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 38, y + 17, 76, 3);
  ctx.fillStyle = color; ctx.fillRect(x - 38, y - 12, 76, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x - 38, y - 12, 76, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 1, y - 12, 2, 32);
  ctx.fillStyle = color; ctx.fillRect(x - 44, y - 10, 6, 30); ctx.fillRect(x + 38, y - 10, 6, 30);
}
function drawPlant(ctx, x, y, size) {
  size = size || 1; const s = size;
  ctx.fillStyle = C.shadow; ctx.fillRect(x - 8*s, y + 12*s, 18*s, 4*s);
  ctx.fillStyle = '#8b4513'; ctx.fillRect(x - 7*s, y + 4*s, 16*s, 10*s);
  ctx.fillStyle = '#a0522d'; ctx.fillRect(x - 7*s, y + 4*s, 16*s, 2*s);
  ctx.fillStyle = '#2d5a2d';
  ctx.fillRect(x - 10*s, y - 8*s, 4*s, 14*s); ctx.fillRect(x - 2*s, y - 12*s, 4*s, 18*s); ctx.fillRect(x + 6*s, y - 6*s, 4*s, 12*s);
  ctx.fillStyle = '#4a8b3a'; ctx.fillRect(x - 9*s, y - 6*s, 2*s, 8*s); ctx.fillRect(x - 1*s, y - 10*s, 2*s, 12*s);
}
function drawBookshelf(ctx, x, y, color) {
  ctx.fillStyle = C.shadow; ctx.fillRect(x - 20, y + 32, 42, 5);
  ctx.fillStyle = '#5a371c'; ctx.fillRect(x - 20, y - 30, 40, 62);
  ctx.fillStyle = '#8b5a30'; ctx.fillRect(x - 20, y - 30, 40, 2);
  ctx.fillStyle = '#3a2010'; ctx.fillRect(x - 18, y - 12, 36, 2); ctx.fillRect(x - 18, y + 8, 36, 2);
  const cc = [color, '#e74c3c', '#3498db', '#27ae60', '#f39c12', '#9b59b6'];
  for (let row = 0; row < 3; row++) {
    let bx = x - 17;
    for (let b = 0; b < 5; b++) {
      const bw = 5 + (b % 2) * 2;
      const bh = 14 + ((b + row) % 3) * 2;
      ctx.fillStyle = cc[(b + row) % cc.length];
      ctx.fillRect(bx, y - 28 + row * 20, bw, bh);
      bx += bw + 1;
    }
  }
}
function drawWhiteboard(ctx, x, y) {
  ctx.fillStyle = C.shadow; ctx.fillRect(x - 30, y + 22, 64, 4);
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x - 30, y - 20, 62, 42);
  ctx.fillStyle = '#f5f5f5'; ctx.fillRect(x - 28, y - 18, 58, 38);
  ctx.fillStyle = '#3b82f6'; ctx.fillRect(x - 24, y - 14, 10, 2); ctx.fillRect(x - 24, y - 10, 18, 2);
  ctx.fillStyle = '#ef4444'; ctx.fillRect(x - 10, y - 2, 20, 2);
  ctx.fillStyle = '#10b981'; ctx.fillRect(x + 4, y + 8, 22, 2);
}
function drawWaterCooler(ctx, x, y) {
  ctx.fillStyle = C.shadow; ctx.fillRect(x - 10, y + 22, 22, 4);
  ctx.fillStyle = '#2a3040'; ctx.fillRect(x - 9, y - 4, 20, 26);
  ctx.fillStyle = '#4a5060'; ctx.fillRect(x - 9, y - 4, 20, 2);
  ctx.fillStyle = '#a7d8ff'; ctx.fillRect(x - 10, y - 24, 22, 20);
  ctx.fillStyle = '#c9e8ff'; ctx.fillRect(x - 10, y - 24, 22, 3);
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x - 2, y + 6, 4, 3);
}
function drawPrinter(ctx, x, y) {
  ctx.fillStyle = C.shadow; ctx.fillRect(x - 16, y + 10, 34, 4);
  ctx.fillStyle = '#e5e5e5'; ctx.fillRect(x - 15, y - 8, 30, 18);
  ctx.fillStyle = '#f5f5f5'; ctx.fillRect(x - 15, y - 8, 30, 2);
  ctx.fillStyle = '#10b981'; ctx.fillRect(x + 4, y + 2, 8, 4);
}
function drawTable(ctx, x, y) {
  ctx.fillStyle = C.shadow; ctx.fillRect(x - 22, y + 12, 46, 4);
  ctx.fillStyle = '#8b5a30'; ctx.fillRect(x - 22, y - 2, 44, 14);
  ctx.fillStyle = '#a67c4a'; ctx.fillRect(x - 22, y - 2, 44, 2);
  ctx.fillStyle = '#3a2010'; ctx.fillRect(x - 20, y + 12, 3, 4); ctx.fillRect(x + 17, y + 12, 3, 4);
}

function drawFurniture(ctx) {
  // MARKETING (azul) — mesa Aurora + estante Cerebro + whiteboard + planta
  drawDesk(ctx, 100, 170, '#60a5fa'); drawChair(ctx, 100, 200, '#2a3040');
  drawWhiteboard(ctx, 240, 95, '#60a5fa'); drawPlant(ctx, 40, 250, 0.9);
  drawBookshelf(ctx, 280, 175, '#60a5fa');
  // DIRETORIA (roxo) — mesa Finn + estantes de relatorios
  drawDesk(ctx, 440, 170, '#a78bfa'); drawChair(ctx, 440, 200, '#2a3040');
  drawBookshelf(ctx, 360, 130, '#a78bfa'); drawBookshelf(ctx, 570, 130, '#a78bfa'); drawPlant(ctx, 360, 250, 0.8);
  // COMERCIAL (rosa) — mesa Zezinho + whiteboard de funil + impressora + planta
  drawDesk(ctx, 780, 170, '#f472b6'); drawChair(ctx, 780, 200, '#2a3040');
  drawWhiteboard(ctx, 690, 95, '#f472b6'); drawPrinter(ctx, 900, 100); drawPlant(ctx, 910, 250, 0.9);
  // RH (verde) — mesa Dipsy + sofa + mesa reuniao + planta
  drawDesk(ctx, 160, 410, '#10b981'); drawChair(ctx, 160, 440, '#2a3040');
  drawSofa(ctx, 80, 530, '#3a5b2e'); drawTable(ctx, 80, 500); drawPlant(ctx, 270, 530, 1.0);
  // FINANCEIRO (amarelo) — mesa Aranha + cooler + estante pastas + planta
  drawDesk(ctx, 470, 450, '#fbbf24'); drawChair(ctx, 470, 480, '#2a3040');
  drawWaterCooler(ctx, 380, 470); drawBookshelf(ctx, 580, 460, '#fbbf24'); drawPlant(ctx, 380, 540, 0.8);
  // ATENDIMENTO (laranja) — mesa Byte + sofa espera cliente + mesa apoio
  drawDesk(ctx, 800, 450, '#fb923c'); drawChair(ctx, 800, 480, '#2a3040');
  drawSofa(ctx, 720, 550, '#8b4513'); drawTable(ctx, 870, 530); drawPlant(ctx, 920, 450, 0.9);
}

function drawBackground(ctx, W, H) {
  ctx.fillStyle = '#1a1f2e'; ctx.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 20) {
    ctx.fillStyle = ((x / 20) % 2 === 0) ? '#3a4054' : '#454b5f';
    ctx.fillRect(x, 284, 20, 32);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, 284, W, 1); ctx.fillRect(0, 315, W, 1);

  // Headline institucional no topo do cenario
  drawHeadline(ctx, W);

  ROOMS.forEach(r => { drawFloor(ctx, r); drawWalls(ctx, r); });
  drawFurniture(ctx);

  // Quadro do Pinguim na parede da Diretoria
  drawDiretoriaPainel(ctx);
}

function drawHeadline(ctx, W) {
  ctx.save();
  ctx.font = 'bold 11px -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = 'AGÊNCIA PINGUIM · IA';
  ctx.fillStyle = 'rgba(232, 92, 0, 0.85)';
  // letterspacing manual
  const chars = text.split('');
  const spacing = 1.5;
  const total = chars.reduce((s, c) => s + ctx.measureText(c).width + spacing, -spacing);
  let x = W / 2 - total / 2;
  const y = 14;
  chars.forEach(c => {
    const w = ctx.measureText(c).width;
    ctx.fillText(c, x + w / 2, y);
    x += w + spacing;
  });
  ctx.restore();
}

// Imagem do pinguim (carregada uma vez, reutilizada em todo frame)
let _pinguimImg = null;
let _pinguimReady = false;
function getPinguimImg() {
  if (_pinguimImg) return _pinguimImg;
  _pinguimImg = new Image();
  _pinguimImg.onload = () => { _pinguimReady = true; };
  // SVG inline pra evitar CORS no canvas — pinguim branco
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="180 0 700 880">
    <path d="M180 631.739L180.401 779.881L225.57 726.828L249.482 763.965L329.191 663.166L369.045 827.627L451.41 692.344L605.514 875.374L666.624 803.754L730.39 875.374C741.851 770.066 747.145 722.655 743.675 652.555C740.205 582.456 661.31 514.62 610.828 411.168L565.659 395.252L517.701 442.269L483.338 437.253L454.067 517.272C406.196 531.028 366 575.211 350.446 618.071L246.825 532.022L180 631.739Z" fill="#ffffff"/>
    <path d="M180 606.184C265.66 223.443 351.616 65.5948 610.828 143.254L820.727 132.644C640.285 232.762 586.139 294.369 608.218 395.252L565.659 381.233L515.177 429.736L477.98 424.431L446.46 504.978C396.911 526.453 374.103 544.107 347.789 594.198L246.825 506.662L180 606.184Z" fill="#ffffff"/>
  </svg>`;
  _pinguimImg.src = 'data:image/svg+xml;base64,' + btoa(svg);
  return _pinguimImg;
}

function drawDiretoriaPainel(ctx) {
  // Adaptado pro canvas Cyber: 3 paineis (um por sala) com simbolo tematico.
  const PAINEIS_CYBER = [
    { cx: 170, cy: 75, simbolo: '🛡', cor: '#3b82f6' },  // central-ops
    { cx: 490, cy: 75, simbolo: '⚠', cor: '#ef4444' },   // oficina-inov
    { cx: 810, cy: 75, simbolo: '🔐', cor: '#10b981' },  // guarita
  ];
  const w = 56, h = 64;
  PAINEIS_CYBER.forEach(p => {
    const { cx, cy, simbolo, cor } = p;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(cx - w/2, cy - h/2, w, h);
    ctx.strokeStyle = cor;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - w/2, cy - h/2, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(cx - w/2 + 2, cy - h/2 + 2, w - 4, 2);
    ctx.fillStyle = cor;
    ctx.font = '32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(simbolo, cx, cy + 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  });
}

// Destaca salas ativas com borda pulsante amarela + dim nas inativas
// mode: 'full' (dim+highlight) | 'dim' (so dim) | 'highlight' (so borda/badge)
function drawRoomOverlay(ctx, activeRoomIds, frame, mode = 'full') {
  const activeSet = new Set(activeRoomIds || []);
  const pulse = 0.55 + Math.sin(frame * 0.08) * 0.25;

  if (mode === 'full' || mode === 'dim') {
    ROOMS.forEach(r => {
      if (activeSet.has(r.id)) return;
      ctx.fillStyle = 'rgba(8, 10, 20, 0.45)';
      ctx.fillRect(r.x - 3, r.y - 14, r.w + 6, r.h + 17);
    });
  }

  if (mode === 'full' || mode === 'highlight') {
    ROOMS.forEach(r => {
      if (!activeSet.has(r.id)) return;
      ctx.save();
      ctx.shadowColor = 'rgba(251, 191, 36, 0.8)';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = `rgba(251, 191, 36, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(r.x - 3, r.y - 14, r.w + 6, r.h + 17);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(254, 215, 111, ${pulse * 0.8})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x - 1, r.y - 12, r.w + 2, r.h + 13);
      ctx.restore();

      // Badge "ATIVO" no canto superior direito da sala
      const badgeX = r.x + r.w - 58;
      const badgeY = r.y + 4;
      ctx.fillStyle = `rgba(251, 191, 36, ${pulse})`;
      ctx.fillRect(badgeX, badgeY, 50, 18);
      ctx.fillStyle = '#0a0a0a';
      ctx.font = 'bold 10px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('● ATIVO', badgeX + 25, badgeY + 12);
      ctx.textAlign = 'left';
    });
  }
}

/* ============================== CHARACTER ============================== */
function drawCharacter(ctx, x, y, agent, state, frame, direction, holdingPaper, isProtagonist) {
  const walkPhase = Math.floor(frame / 6) % 4;
  const walkBob = (state === 'walking') ? [0, -1, 0, 1][walkPhase] : 0;
  const legOffset = (state === 'walking') ? [0, 2, 0, -2][walkPhase] : 0;
  const armSwing = (state === 'walking') ? [0, 2, 0, -2][walkPhase] : 0;
  const breathe = state === 'working' ? Math.sin(frame * 0.1) * 0.5 : 0;
  const sitting = state === 'working' || state === 'sitting';

  // Halo amarelo pulsante nos protagonistas — marca "quem esta na missao"
  if (isProtagonist) {
    const pulse = 0.6 + Math.sin(frame * 0.08) * 0.18;
    const r = 22 + Math.sin(frame * 0.08) * 2;
    const grad = ctx.createRadialGradient(x, y + 4, 2, x, y + 4, r);
    grad.addColorStop(0, `rgba(251, 191, 36, ${pulse * 0.35})`);
    grad.addColorStop(0.7, `rgba(251, 191, 36, ${pulse * 0.12})`);
    grad.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y + 4, r, 0, Math.PI * 2); ctx.fill();
  }

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y + (sitting ? -2 : 0) + breathe));

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, 20, 10, 3, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = agent.pants;
  if (sitting) {
    ctx.fillRect(-4, 8, 3, 6); ctx.fillRect(1, 8, 3, 6);
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(-4, 14, 3, 2); ctx.fillRect(1, 14, 3, 2);
  } else {
    ctx.fillRect(-4, 8 + walkBob, 3, 10 - Math.abs(legOffset));
    ctx.fillRect(1, 8 + walkBob, 3, 10 - Math.abs(legOffset));
    if (state === 'walking') {
      if (direction === 'right') {
        ctx.fillRect(1, 8 + walkBob + legOffset, 3, 10);
        ctx.fillStyle = agent.pants; ctx.fillRect(-4, 8 + walkBob - legOffset, 3, 10);
      } else if (direction === 'left') {
        ctx.fillRect(-4, 8 + walkBob + legOffset, 3, 10);
        ctx.fillStyle = agent.pants; ctx.fillRect(1, 8 + walkBob - legOffset, 3, 10);
      }
    }
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(-4, 17 + walkBob, 3, 2); ctx.fillRect(1, 17 + walkBob, 3, 2);
  }

  ctx.fillStyle = agent.shirt;
  ctx.fillRect(-6, -4 + walkBob, 12, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(-6, -4 + walkBob, 12, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(-6, 6 + walkBob, 12, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-2, -4 + walkBob, 4, 2);

  ctx.fillStyle = agent.shirt;
  if (state === 'working') {
    ctx.fillRect(-8, -1, 3, 5); ctx.fillRect(5, -1, 3, 5);
    ctx.fillStyle = agent.skin; ctx.fillRect(-8, 4, 3, 2); ctx.fillRect(5, 4, 3, 2);
    if (Math.floor(frame / 8) % 2 === 0) { ctx.fillStyle = agent.skin; ctx.fillRect(-8, 3, 3, 1); }
  } else if (holdingPaper) {
    ctx.fillRect(-8, -2 + walkBob, 3, 6); ctx.fillRect(5, -2 + walkBob, 3, 6);
    ctx.fillStyle = agent.skin; ctx.fillRect(-8, 4 + walkBob, 3, 2); ctx.fillRect(5, 4 + walkBob, 3, 2);
    const px = -6, py = 4 + walkBob;
    ctx.fillStyle = C.paper; ctx.fillRect(px, py, 12, 8);
    ctx.fillStyle = C.paperEdge; ctx.fillRect(px, py, 12, 1);
    ctx.fillStyle = '#6b7280'; ctx.fillRect(px + 1, py + 2, 10, 1); ctx.fillRect(px + 1, py + 4, 7, 1); ctx.fillRect(px + 1, py + 6, 9, 1);
  } else {
    ctx.fillRect(-8, -2 + walkBob + armSwing, 3, 8); ctx.fillRect(5, -2 + walkBob - armSwing, 3, 8);
    ctx.fillStyle = agent.skin; ctx.fillRect(-8, 6 + walkBob + armSwing, 3, 2); ctx.fillRect(5, 6 + walkBob - armSwing, 3, 2);
  }

  ctx.fillStyle = agent.skin; ctx.fillRect(-5, -14 + walkBob, 10, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(3, -14 + walkBob, 2, 10);
  ctx.fillStyle = agent.hair;
  if (direction === 'up') {
    ctx.fillRect(-5, -14 + walkBob, 10, 7);
  } else {
    ctx.fillRect(-5, -14 + walkBob, 10, 4);
    ctx.fillRect(-5, -14 + walkBob, 2, 7);
    ctx.fillRect(3, -14 + walkBob, 2, 5);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(-4, -14 + walkBob, 3, 1);

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
    ctx.fillStyle = '#8b4513';
    if (state === 'working') ctx.fillRect(-1, -6 + walkBob, 2, 1);
    else ctx.fillRect(-2, -6 + walkBob, 4, 1);
  }
  ctx.restore();

  const tagY = y - 36;
  ctx.font = 'bold 11px -apple-system, "Segoe UI", sans-serif';
  const tagW = ctx.measureText(agent.name).width + 14;
  ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(x - tagW/2, tagY, tagW, 15);
  ctx.fillStyle = agent.shirt; ctx.fillRect(x - tagW/2, tagY + 13, tagW, 2);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.fillText(agent.name, x, tagY + 11); ctx.textAlign = 'left';

  if (state === 'working') {
    const bubX = x + 12;
    const bubY = y - 24 + Math.sin(frame * 0.15) * 1;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(bubX, bubY, 18, 10);
    const dotFrame = Math.floor(frame / 10) % 4;
    ctx.fillStyle = '#fbbf24';
    for (let i = 0; i < 3; i++) { if (i <= dotFrame) ctx.fillRect(bubX + 3 + i * 4, bubY + 4, 2, 2); }
  }
  if (state === 'done') {
    const chY = y - 24;
    ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.arc(x + 12, chY, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + 9, chY); ctx.lineTo(x + 11, chY + 2); ctx.lineTo(x + 15, chY - 2); ctx.stroke();
  }
  if (state === 'thinking') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x + 10, y - 28, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0a0a'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('?', x + 7, y - 25);
  }
}

function drawSpeechBubble(ctx, x, y, text) {
  ctx.font = 'bold 15px -apple-system, "Segoe UI", sans-serif';
  const padX = 12;
  const padY = 8;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 28;
  const bx = x - w/2;
  const by = y - 56;
  // Sombra suave
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(bx + 2, by + 2, w, h);
  // Balao
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bx, by, w, h);
  ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, w, h);
  // Rabinho
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(x - 6, by + h); ctx.lineTo(x + 6, by + h); ctx.lineTo(x, by + h + 8); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 6, by + h); ctx.lineTo(x, by + h + 8); ctx.lineTo(x + 6, by + h); ctx.stroke();
  // Texto
  ctx.fillStyle = '#0a0a0a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, by + h/2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/* ============================== ENGINE ============================== */
export function criarEngine(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height;

  // Pre-carrega imagem do pinguim pra evitar flicker no 1o frame
  getPinguimImg();

  const agentState = {};
  AGENTS_DEF.forEach((a, i) => {
    agentState[a.id] = {
      x: a.home.x, y: a.home.y,
      targetX: a.home.x, targetY: a.home.y,
      waypoints: [], state: 'idle', direction: 'down',
      pendingState: null, holdingPaper: false,
      speechBubble: null, speechTimer: 0,
      protagonist: false,
      // Offset escalonado (30-120 frames) — agentes comecam em momentos diferentes
      idleNextAt: 30 + i * 18 + Math.floor(Math.random() * 40),
      idleBusy: false,
    };
  });

  const protagonistSet = new Set();
  // Squad Cyber nao tem 'diretoria' interna — todos sao operacionais.
  // Mantem array vazio pra desativar logica de reuniao automatica do canvas pai.
  const SOCIOS_DIRETORIA = [];
  let proximaReuniao = 360 + Math.floor(Math.random() * 240); // 6-10s apos boot
  let frame = 0;
  let floatingPapers = [];
  let rafId = null;
  let destroyed = false;

  // Retorna um ponto aleatorio dentro da sala do agente, com margem
  function pontoRandomNaSala(agent, margem = 40) {
    const room = ROOMS.find(r => r.id === agent.roomId);
    if (!room) return { x: agent.home.x, y: agent.home.y };
    const minX = room.x + margem;
    const maxX = room.x + room.w - margem;
    const minY = Math.max(room.y + margem + 8, room.y + 30);
    const maxY = room.y + room.h - margem;
    return {
      x: Math.round(minX + Math.random() * (maxX - minX)),
      y: Math.round(minY + Math.random() * (maxY - minY)),
    };
  }

  // Banco de falas decorativas por agente Cyber (contextual a especialidade)
  const FALAS_IDLE = {
    // CENTRAL DE OPERACOES
    ingrid:   ['Lendo logs', '🎯', 'Padrao novo', 'IP suspeito', 'Alerta!', 'Anomalia', 'Threat intel', 'Hmm...', '🔍'],
    fernanda: ['Baseline ok', '👁', 'Vendo trafego', 'Spike?', 'Anomalia leve', 'Tudo normal', 'Comparando', '📊', 'Detectado'],
    // OFICINA DE INOVACAO
    bejairo:  ['Atacando', '🛡', 'Vuln aqui!', 'Exploit?', 'F12 testado', 'Red team', 'Bypass...', 'Hmm', '⚔'],
    rafael:   ['Pentest', '🔓', 'OWASP check', 'Vuln nivel 3', 'Mapa pronto', 'Brute force', 'Camadas ok', '🧪'],
    // GUARITA DO COFRE
    tati:     ['Codigo limpo', '🔐', 'Input ok', 'XSS coberto', 'Validacao!', 'Sanitiza...', 'Manico aprovaria', '✅'],
    dom:      ['Zero Trust', '⚔', 'JWT valido', 'Allowlist', 'Sem selo nao', 'Cofre intacto', 'Validado', '🔑', 'Acesso negado'],
  };

  // Sem reunioes automaticas — Cyber nao tem 'diretoria'. Array vazio
  // mantem compatibilidade com codigo do canvas pai.
  const CONVERSAS_DIRETORIA = [];

  // Sorteia uma acao idle variada na casa do agente pra dar vida ao cenario
  function agendarIdleDecorativo(id) {
    const s = agentState[id];
    const agent = AGENTS_DEF.find(a => a.id === id);
    if (!agent || s.idleBusy) return;
    if (protagonistSet.has(id)) return;
    if (s.state === 'walking') return;

    s.idleBusy = true;
    const falasAgente = FALAS_IDLE[id] || ['Hmm...'];

    const acoes = [
      // 1) Olhar ao redor (muda direcao varias vezes)
      () => {
        const dirs = ['down', 'left', 'right', 'up'];
        let step = 0;
        const trocarDir = () => {
          if (destroyed || step >= 3) { if (!destroyed) { s.direction = 'down'; s.idleBusy = false; } return; }
          s.direction = dirs[Math.floor(Math.random() * dirs.length)];
          step++;
          setTimeout(trocarDir, 700 + Math.random() * 500);
        };
        trocarDir();
      },
      // 2) Caminhar ate ponto aleatorio e voltar pra mesa
      () => {
        const destino = pontoRandomNaSala(agent, 40);
        s.waypoints = [destino, { x: agent.home.x, y: agent.home.y }];
        s.pendingState = 'idle';
        s.targetX = s.waypoints[0].x; s.targetY = s.waypoints[0].y;
        s.waypoints.shift();
        const tryFinish = () => {
          if (destroyed) return;
          if (s.waypoints.length === 0 && Math.abs(s.targetX - s.x) < 3 && Math.abs(s.targetY - s.y) < 3) {
            s.idleBusy = false;
          } else requestAnimationFrame(tryFinish);
        };
        tryFinish();
      },
      // 3) Caminhar em "circuito" (3 paradas curtas pela sala)
      () => {
        const p1 = pontoRandomNaSala(agent, 30);
        const p2 = pontoRandomNaSala(agent, 30);
        const p3 = { x: agent.home.x, y: agent.home.y };
        s.waypoints = [p1, p2, p3];
        s.pendingState = 'idle';
        s.targetX = s.waypoints[0].x; s.targetY = s.waypoints[0].y;
        s.waypoints.shift();
        const tryFinish = () => {
          if (destroyed) return;
          if (s.waypoints.length === 0 && Math.abs(s.targetX - s.x) < 3 && Math.abs(s.targetY - s.y) < 3) {
            s.idleBusy = false;
          } else requestAnimationFrame(tryFinish);
        };
        tryFinish();
      },
      // 4) Balao de fala contextual (sem andar)
      () => {
        s.speechBubble = falasAgente[Math.floor(Math.random() * falasAgente.length)];
        s.speechTimer = 100;
        setTimeout(() => { if (!destroyed) s.idleBusy = false; }, 1800);
      },
      // 5) Trabalho breve (digitando na mesa) + balao as vezes
      () => {
        s.state = 'working';
        if (Math.random() < 0.5) {
          s.speechBubble = falasAgente[Math.floor(Math.random() * falasAgente.length)];
          s.speechTimer = 100;
        }
        setTimeout(() => { if (!destroyed) { s.state = 'idle'; s.idleBusy = false; } }, 2200 + Math.random() * 2800);
      },
      // 6) Ir ate a estante/parede/canto e voltar (imita "pegar algo")
      () => {
        const room = ROOMS.find(r => r.id === agent.roomId);
        if (!room) { s.idleBusy = false; return; }
        // Canto aleatorio da sala (nao mesa)
        const cantos = [
          { x: room.x + 30, y: room.y + 40 },
          { x: room.x + room.w - 30, y: room.y + 40 },
          { x: room.x + 30, y: room.y + room.h - 30 },
          { x: room.x + room.w - 30, y: room.y + room.h - 30 },
        ];
        const canto = cantos[Math.floor(Math.random() * cantos.length)];
        s.waypoints = [canto, { x: agent.home.x, y: agent.home.y }];
        s.pendingState = 'idle';
        s.targetX = s.waypoints[0].x; s.targetY = s.waypoints[0].y;
        s.waypoints.shift();
        // Ao chegar no canto, balao rapido
        const tickBalao = setTimeout(() => {
          if (!destroyed) {
            s.speechBubble = falasAgente[Math.floor(Math.random() * falasAgente.length)];
            s.speechTimer = 80;
          }
        }, 1500);
        const tryFinish = () => {
          if (destroyed) { clearTimeout(tickBalao); return; }
          if (s.waypoints.length === 0 && Math.abs(s.targetX - s.x) < 3 && Math.abs(s.targetY - s.y) < 3) {
            s.idleBusy = false;
          } else requestAnimationFrame(tryFinish);
        };
        tryFinish();
      },
    ];
    // Distribuicao ponderada: mais movimento (caminhadas) do que falas paradas
    const pesos = [1, 3, 2, 1, 2, 2]; // olhar, caminhar, circuito, fala, trabalho, canto
    const total = pesos.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < pesos.length; i++) { r -= pesos[i]; if (r <= 0) { idx = i; break; } }
    acoes[idx]();
  }

  function updateAgent(id) {
    const s = agentState[id];
    if (s.waypoints.length > 0 && (Math.abs(s.targetX - s.x) < 2 && Math.abs(s.targetY - s.y) < 2)) {
      const next = s.waypoints.shift();
      s.targetX = next.x; s.targetY = next.y;
    }
    const dx = s.targetX - s.x; const dy = s.targetY - s.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > 2) {
      const speed = 2.8;
      s.x += (dx / dist) * speed; s.y += (dy / dist) * speed;
      s.state = 'walking';
      if (Math.abs(dx) > Math.abs(dy) * 0.5) s.direction = dx > 0 ? 'right' : 'left';
      else s.direction = dy > 0 ? 'down' : 'up';
    } else if (s.state === 'walking' && s.waypoints.length === 0) {
      s.state = s.pendingState || 'idle'; s.pendingState = null;
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
      ctx.beginPath(); ctx.ellipse(x, p.y1 + (p.y2 - p.y1) * t + 12, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
      const rot = Math.sin(frame * 0.2) * 0.1;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = C.paper; ctx.fillRect(-6, -8, 12, 16);
      ctx.fillStyle = C.paperEdge; ctx.fillRect(-6, -8, 12, 1);
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(-5, -5, 10, 1); ctx.fillRect(-5, -2, 8, 1); ctx.fillRect(-5, 1, 9, 1); ctx.fillRect(-5, 4, 7, 1);
      ctx.restore();
    });
  }

  // Calcula quais salas estao ativas baseado na posicao atual dos protagonistas
  // (sala de origem + sala onde ele esta agora — cobre handoff no corredor)
  function salasAtivas() {
    const ativas = new Set();
    protagonistSet.forEach(id => {
      const agent = AGENTS_DEF.find(a => a.id === id);
      if (agent) ativas.add(agent.roomId);
      // Detecta sala atual do agente pela posicao
      const s = agentState[id];
      const room = ROOMS.find(r => s.x >= r.x && s.x <= r.x + r.w && s.y >= r.y && s.y <= r.y + r.h);
      if (room) ativas.add(room.id);
    });
    return ativas;
  }

  function render() {
    if (destroyed) return;
    frame++;
    drawBackground(ctx, W, H);
    AGENTS_DEF.forEach(a => updateAgent(a.id));
    updateFloatingPapers();

    // Idle decorativo
    AGENTS_DEF.forEach(a => {
      const s = agentState[a.id];
      if (protagonistSet.has(a.id)) return;
      if (s.idleBusy || s.state === 'walking') return;
      if (frame < s.idleNextAt) return;
      agendarIdleDecorativo(a.id);
      s.idleNextAt = frame + 90 + Math.floor(Math.random() * 150);
    });

    // Conversa de reuniao da Diretoria — dispara periodicamente
    // Se 2+ socios estao idle (nao protagonistas, nao andando), trocam falas em sequencia
    if (frame >= proximaReuniao) {
      const sociosIdle = SOCIOS_DIRETORIA.filter(id => {
        const s = agentState[id];
        return !protagonistSet.has(id) && s.state !== 'walking' && !s.idleBusy;
      });
      if (sociosIdle.length >= 2) {
        const conversa = CONVERSAS_DIRETORIA[Math.floor(Math.random() * CONVERSAS_DIRETORIA.length)];
        sociosIdle.slice(0, 3).forEach((id, i) => {
          const fala = conversa[i] || conversa[conversa.length - 1];
          const s = agentState[id];
          // Cada socio fala em sequencia, espacado ~1.4s
          setTimeout(() => {
            if (destroyed) return;
            if (protagonistSet.has(id)) return;
            s.speechBubble = fala;
            s.speechTimer = 110;
          }, i * 1400);
        });
      }
      proximaReuniao = frame + 540 + Math.floor(Math.random() * 360); // proxima em 9-15s
    }

    const ativas = salasAtivas();

    // 1) Dim nas salas inativas (cobre tudo que vai ser desenhado nelas)
    drawRoomOverlay(ctx, [...ativas], frame, 'dim');

    drawFloatingPapers();

    // 2) Desenha todos os agentes — os inativos ja estao sob o dim porque
    //    foram desenhados ANTES (drawBackground -> drawFurniture), e a chamada
    //    acima aplicou dim em cima da furniture das salas inativas. Agentes
    //    sao desenhados agora, entao inativos em sala inativa ficarao sem dim
    //    sobre eles. Pra compensar, aplicamos dim de novo APENAS nos agentes
    //    nao-protagonistas em salas inativas.
    const sorted = [...AGENTS_DEF].sort((a, b) => agentState[a.id].y - agentState[b.id].y);
    sorted.forEach(a => {
      const s = agentState[a.id];
      drawCharacter(ctx, s.x, s.y, a, s.state, frame, s.direction, s.holdingPaper, s.protagonist);
      if (s.speechTimer > 0 && s.speechBubble) drawSpeechBubble(ctx, s.x, s.y, s.speechBubble);
    });

    // 3) Re-aplica dim nas salas inativas pra "apagar" os agentes inativos
    //    que foram desenhados ali. Protagonistas ficam em salas ativas entao
    //    nao sao afetados por esse overlay.
    drawRoomOverlay(ctx, [...ativas], frame, 'dim');

    // 4) Redesenha SO os protagonistas por cima (sempre visiveis e com halo)
    sorted.forEach(a => {
      if (!protagonistSet.has(a.id)) return;
      const s = agentState[a.id];
      drawCharacter(ctx, s.x, s.y, a, s.state, frame, s.direction, s.holdingPaper, true);
      if (s.speechTimer > 0 && s.speechBubble) drawSpeechBubble(ctx, s.x, s.y, s.speechBubble);
    });

    // 5) Highlight das salas ativas (borda pulsante + badge ATIVO) por cima de tudo
    drawRoomOverlay(ctx, [...ativas], frame, 'highlight');

    rafId = requestAnimationFrame(render);
  }

  function pathFromTo(agentId, tx, ty) {
    const s = agentState[agentId];
    const wp = [];
    const inTop = s.y < 290;
    const targetTop = ty < 290;
    if (inTop && !targetTop) {
      wp.push({ x: s.x, y: 260 }); wp.push({ x: s.x, y: 300 });
      wp.push({ x: tx, y: 300 }); wp.push({ x: tx, y: 340 }); wp.push({ x: tx, y: ty });
    } else if (!inTop && targetTop) {
      wp.push({ x: s.x, y: 340 }); wp.push({ x: s.x, y: 300 });
      wp.push({ x: tx, y: 300 }); wp.push({ x: tx, y: 260 }); wp.push({ x: tx, y: ty });
    } else if (inTop && targetTop) {
      wp.push({ x: s.x, y: 260 }); wp.push({ x: tx, y: 260 }); wp.push({ x: tx, y: ty });
    } else {
      wp.push({ x: s.x, y: 340 }); wp.push({ x: tx, y: 340 }); wp.push({ x: tx, y: ty });
    }
    s.waypoints = wp;
    if (wp.length > 0) { s.targetX = wp[0].x; s.targetY = wp[0].y; s.waypoints.shift(); }
  }

  async function walkTo(agentId, tx, ty, endState) {
    const s = agentState[agentId];
    pathFromTo(agentId, tx, ty);
    s.pendingState = endState || 'idle';
    return new Promise(resolve => {
      const check = () => {
        if (destroyed) return resolve();
        if (s.waypoints.length === 0 && Math.abs(s.targetX - s.x) < 3 && Math.abs(s.targetY - s.y) < 3) resolve();
        else requestAnimationFrame(check);
      };
      check();
    });
  }
  function say(agentId, text, duration) {
    agentState[agentId].speechBubble = text;
    agentState[agentId].speechTimer = duration || 120;
  }
  function throwPaper(fromId, toId) {
    const sf = agentState[fromId]; const st = agentState[toId];
    floatingPapers.push({ x1: sf.x, y1: sf.y - 4, x2: st.x, y2: st.y - 4, progress: 0 });
  }
  function setHolding(agentId, holding) { agentState[agentId].holdingPaper = holding; }
  function setState(agentId, state) { agentState[agentId].state = state; }
  function setProtagonists(ids) {
    protagonistSet.clear();
    (ids || []).forEach(id => {
      if (agentState[id]) {
        agentState[id].protagonist = true;
        agentState[id].idleBusy = false;
        protagonistSet.add(id);
      }
    });
    // Garante que nao-protagonistas percam flag
    AGENTS_DEF.forEach(a => {
      if (!protagonistSet.has(a.id)) agentState[a.id].protagonist = false;
    });
  }

  render();

  return {
    walkTo, say, throwPaper, setHolding, setState, setProtagonists,
    agentsByPos: () => [...AGENTS_DEF].map(a => ({ id: a.id, name: a.name, role: a.role, emoji: a.emoji, shirt: a.shirt })),
    getAgentDef: (id) => AGENTS_DEF.find(a => a.id === id),
    destroy: () => { destroyed = true; if (rafId) cancelAnimationFrame(rafId); },
  };
}

export const SQUAD_AGENTS = AGENTS_DEF;
