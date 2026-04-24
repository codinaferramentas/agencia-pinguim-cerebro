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

const ROOMS = [
  { id: 'marketing', name: 'MARKETING',       x: 20,  y: 40,  w: 300, h: 240, floor: 'carpet', color: '#60a5fa' },
  { id: 'copy',      name: 'COPY & CONTEUDO', x: 340, y: 40,  w: 280, h: 240, floor: 'wood',   color: '#a78bfa' },
  { id: 'design',    name: 'DESIGN',          x: 640, y: 40,  w: 300, h: 240, floor: 'tile',   color: '#f472b6' },
  { id: 'rh',        name: 'RH & GESTAO',     x: 20,  y: 320, w: 280, h: 260, floor: 'green',  color: '#10b981' },
  { id: 'revisao',   name: 'REVISAO & QA',    x: 320, y: 320, w: 300, h: 260, floor: 'wood',   color: '#fbbf24' },
  { id: 'cliente',   name: 'SALA DO CLIENTE', x: 640, y: 320, w: 300, h: 260, floor: 'carpet', color: '#fb923c' },
];

const AGENTS_DEF = [
  { id: 'gerente',   name: 'Finn',    role: 'Gerente',         emoji: '🎯', roomId: 'rh',
    skin: '#fcd7b6', shirt: '#10b981', pants: '#1f2937', hair: '#3a1f0a',
    desk: { x: 160, y: 420 }, chair: { x: 160, y: 440 }, home: { x: 160, y: 470 } },
  { id: 'gancho',    name: 'Byte',    role: 'Pesquisa',        emoji: '🔎', roomId: 'marketing',
    skin: '#e8b48a', shirt: '#60a5fa', pants: '#2a3040', hair: '#0a0a0a',
    desk: { x: 100, y: 180 }, chair: { x: 100, y: 200 }, home: { x: 100, y: 230 } },
  { id: 'desenvolv', name: 'Aurora',  role: 'Analise',         emoji: '✍', roomId: 'copy',
    skin: '#fcd7b6', shirt: '#a78bfa', pants: '#1f2937', hair: '#c05050',
    desk: { x: 440, y: 180 }, chair: { x: 440, y: 200 }, home: { x: 440, y: 230 } },
  { id: 'cta',       name: 'Zezinho', role: 'Entrega',         emoji: '📢', roomId: 'design',
    skin: '#d4a07a', shirt: '#f472b6', pants: '#2a3040', hair: '#2a1a0a',
    desk: { x: 780, y: 180 }, chair: { x: 780, y: 200 }, home: { x: 780, y: 230 } },
  { id: 'validador', name: 'Dipsy',   role: 'Validador',       emoji: '🔍', roomId: 'revisao',
    skin: '#fcd7b6', shirt: '#fbbf24', pants: '#1f2937', hair: '#6a4a2a',
    desk: { x: 470, y: 460 }, chair: { x: 470, y: 480 }, home: { x: 470, y: 510 } },
  { id: 'oculto',    name: 'Aranha',  role: 'Cliente Oculto',  emoji: '👁', roomId: 'cliente',
    skin: '#e8b48a', shirt: '#fb923c', pants: '#2a3040', hair: '#0a0a0a',
    desk: { x: 800, y: 460 }, chair: { x: 800, y: 480 }, home: { x: 800, y: 510 } },
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
  drawDesk(ctx, 100, 170, '#60a5fa'); drawChair(ctx, 100, 200, '#2a3040');
  drawWhiteboard(ctx, 240, 95, '#60a5fa'); drawPlant(ctx, 40, 250, 0.9);
  drawBookshelf(ctx, 280, 175, '#60a5fa');
  drawDesk(ctx, 440, 170, '#a78bfa'); drawChair(ctx, 440, 200, '#2a3040');
  drawBookshelf(ctx, 360, 130, '#a78bfa'); drawBookshelf(ctx, 570, 130, '#a78bfa'); drawPlant(ctx, 360, 250, 0.8);
  drawDesk(ctx, 780, 170, '#f472b6'); drawChair(ctx, 780, 200, '#2a3040');
  drawWhiteboard(ctx, 690, 95, '#f472b6'); drawPrinter(ctx, 900, 100); drawPlant(ctx, 910, 250, 0.9);
  drawDesk(ctx, 160, 410, '#10b981'); drawChair(ctx, 160, 440, '#2a3040');
  drawSofa(ctx, 80, 530, '#3a5b2e'); drawTable(ctx, 80, 500); drawPlant(ctx, 270, 530, 1.0);
  drawDesk(ctx, 470, 450, '#fbbf24'); drawChair(ctx, 470, 480, '#2a3040');
  drawWaterCooler(ctx, 380, 470); drawBookshelf(ctx, 580, 460, '#fbbf24'); drawPlant(ctx, 380, 540, 0.8);
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
  ROOMS.forEach(r => { drawFloor(ctx, r); drawWalls(ctx, r); });
  drawFurniture(ctx);
}

/* ============================== CHARACTER ============================== */
function drawCharacter(ctx, x, y, agent, state, frame, direction, holdingPaper) {
  const walkPhase = Math.floor(frame / 6) % 4;
  const walkBob = (state === 'walking') ? [0, -1, 0, 1][walkPhase] : 0;
  const legOffset = (state === 'walking') ? [0, 2, 0, -2][walkPhase] : 0;
  const armSwing = (state === 'walking') ? [0, 2, 0, -2][walkPhase] : 0;
  const breathe = state === 'working' ? Math.sin(frame * 0.1) * 0.5 : 0;
  const sitting = state === 'working' || state === 'sitting';

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
  ctx.font = 'bold 12px -apple-system, "Segoe UI", sans-serif';
  const w = ctx.measureText(text).width + 16;
  const h = 22;
  const bx = x - w/2;
  const by = y - 48;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.moveTo(x - 4, by + h); ctx.lineTo(x + 4, by + h); ctx.lineTo(x, by + h + 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(bx, by, w, h);
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, w, h);
  ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'center'; ctx.fillText(text, x, by + 15); ctx.textAlign = 'left';
}

/* ============================== ENGINE ============================== */
export function criarEngine(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height;

  const agentState = {};
  AGENTS_DEF.forEach(a => {
    agentState[a.id] = {
      x: a.home.x, y: a.home.y,
      targetX: a.home.x, targetY: a.home.y,
      waypoints: [], state: 'idle', direction: 'down',
      pendingState: null, holdingPaper: false,
      speechBubble: null, speechTimer: 0,
    };
  });

  let frame = 0;
  let floatingPapers = [];
  let rafId = null;
  let destroyed = false;

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

  function render() {
    if (destroyed) return;
    frame++;
    drawBackground(ctx, W, H);
    AGENTS_DEF.forEach(a => updateAgent(a.id));
    updateFloatingPapers();
    drawFloatingPapers();
    const sorted = [...AGENTS_DEF].sort((a, b) => agentState[a.id].y - agentState[b.id].y);
    sorted.forEach(a => {
      const s = agentState[a.id];
      drawCharacter(ctx, s.x, s.y, a, s.state, frame, s.direction, s.holdingPaper);
      if (s.speechTimer > 0 && s.speechBubble) drawSpeechBubble(ctx, s.x, s.y, s.speechBubble);
    });
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

  render();

  return {
    walkTo, say, throwPaper, setHolding, setState,
    agentsByPos: () => [...AGENTS_DEF].map(a => ({ id: a.id, name: a.name, role: a.role, emoji: a.emoji, shirt: a.shirt })),
    getAgentDef: (id) => AGENTS_DEF.find(a => a.id === id),
    destroy: () => { destroyed = true; if (rafId) cancelAnimationFrame(rafId); },
  };
}

export const SQUAD_AGENTS = AGENTS_DEF;
