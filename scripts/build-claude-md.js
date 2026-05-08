#!/usr/bin/env node
// ============================================================
// build-claude-md.js — V2.8
// Concatena os 7 MDs canonicos do Atendente Pinguim em
// `cerebro/agentes/pessoais/pinguim/` e escreve o resultado em
// `server-cli/CLAUDE.md` (lido pelo `claude` CLI em runtime).
//
// Uso:
//   node scripts/build-claude-md.js          (gera com header padrao)
//   node scripts/build-claude-md.js --check  (so verifica sem escrever)
//
// NAO editar `server-cli/CLAUDE.md` direto — proximo build sobrescreve.
// ============================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FONTE_DIR = path.join(ROOT, 'cerebro', 'agentes', 'pessoais', 'pinguim');
const DESTINO = path.join(ROOT, 'server-cli', 'CLAUDE.md');

// Ordem fixa — define a sequencia em que os MDs entram no prompt final.
// Mudar essa ordem afeta o comportamento do agente (o LLM le top-down).
const ORDEM_MDS = [
  'IDENTITY.md',
  'SOUL.md',
  'AGENTS.md',
  'TOOLS.md',
  'AGENT-CARD.md',
  'SYSTEM-PROMPT.md',
  'APRENDIZADOS.md',
];

const HEADER = `<!--
GERADO AUTOMATICAMENTE por scripts/build-claude-md.js
NAO EDITAR ESTE ARQUIVO DIRETO — proximo build sobrescreve.

Fonte canonica: cerebro/agentes/pessoais/pinguim/
Pra mudar comportamento do Atendente, edite o MD certo:
  - Identidade/auto-conhecimento -> IDENTITY.md
  - Tom/voz/limites             -> SOUL.md
  - Regras operacionais (4 categorias, regra zero) -> AGENTS.md
  - 5 fontes vivas, scripts, mapeamento produto -> TOOLS.md
  - Contrato 7 campos          -> AGENT-CARD.md
  - Briefing rico + delegar    -> SYSTEM-PROMPT.md
  - Aprendizados acumulados    -> APRENDIZADOS.md

Depois rode: node scripts/build-claude-md.js
-->

`;

const SEPARADOR = '\n\n---\n\n';

function lerMd(nome) {
  const arq = path.join(FONTE_DIR, nome);
  if (!fs.existsSync(arq)) {
    throw new Error(`MD obrigatorio nao encontrado: ${arq}`);
  }
  return fs.readFileSync(arq, 'utf-8').trim();
}

function build() {
  const partes = ORDEM_MDS.map(lerMd);
  return HEADER + partes.join(SEPARADOR) + '\n';
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');

  const novo = build();

  if (check) {
    if (!fs.existsSync(DESTINO)) {
      console.error('CLAUDE.md nao existe — rode sem --check pra gerar');
      process.exit(1);
    }
    const atual = fs.readFileSync(DESTINO, 'utf-8');
    if (atual === novo) {
      console.log('OK — CLAUDE.md ja esta em sync com os 7 MDs canonicos');
      process.exit(0);
    } else {
      console.error('CLAUDE.md DIVERGE dos 7 MDs canonicos. Rode sem --check.');
      process.exit(1);
    }
  } else {
    fs.writeFileSync(DESTINO, novo, 'utf-8');
    const totalChars = novo.length;
    const totalLinhas = novo.split('\n').length;
    console.log(`OK — ${DESTINO} regenerado (${totalChars} chars, ${totalLinhas} linhas, ${ORDEM_MDS.length} MDs concatenados)`);
  }
}

main();
