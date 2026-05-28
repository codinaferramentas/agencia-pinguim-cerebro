#!/usr/bin/env node
// ============================================================
// release-extensao.js
// ============================================================
// Empacota uma versao da extensao Pinguim Agentes em zip
// e atualiza a pagina /instalar pra apontar pra ela.
//
// USO:
//   node scripts/release-extensao.js v0.24.0
//
// O QUE FAZ:
//   1. Le c:/Pinguim-extensao/<versao> (pasta pronta)
//   2. Empacota em downloads/pinguim-agentes-<versao>.zip
//   3. Reescreve instalar.html trocando versao antiga pela nova
//   4. Imprime URL final pro Vercel deployar
// ============================================================

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const versao = process.argv[2];
if (!versao || !/^v\d+\.\d+\.\d+$/.test(versao)) {
  console.error('USO: node scripts/release-extensao.js v0.24.0');
  process.exit(1);
}

const pastaExtensao = `c:/Pinguim-extensao/${versao}`;
if (!existsSync(pastaExtensao)) {
  console.error(`Pasta nao existe: ${pastaExtensao}`);
  process.exit(1);
}

const manifestPath = `${pastaExtensao}/manifest.json`;
if (!existsSync(manifestPath)) {
  console.error(`manifest.json nao encontrado em ${pastaExtensao}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
const versaoManifest = `v${manifest.version}`;
if (versaoManifest !== versao) {
  console.error(`Manifest versao ${versaoManifest} != ${versao}. Atualize manifest.json antes.`);
  process.exit(1);
}

const zipPath = `${ROOT}/downloads/pinguim-agentes-${versao}.zip`;

console.log(`Empacotando ${pastaExtensao} -> ${zipPath}...`);
// PowerShell Compress-Archive (built-in no Windows)
try {
  execSync(
    `powershell.exe -Command "Compress-Archive -Path '${pastaExtensao}/*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: 'inherit' },
  );
} catch (e) {
  console.error('Falha no zip:', e.message);
  process.exit(1);
}

const tamanho = (statSync(zipPath).size / 1024).toFixed(1);
console.log(`OK ${zipPath} (${tamanho} KB)`);

// Atualiza instalar.html
const instalarHtmlPath = `${ROOT}/instalar.html`;
let html = readFileSync(instalarHtmlPath, 'utf-8');

// Detecta versao antiga (deve estar em multiplos lugares)
const matchAntiga = html.match(/v(\d+\.\d+\.\d+)/);
if (!matchAntiga) {
  console.error('Nao achei versao antiga em instalar.html');
  process.exit(1);
}
const versaoAntiga = matchAntiga[0];

if (versaoAntiga === versao) {
  console.log(`instalar.html ja aponta pra ${versao}, nada a fazer.`);
} else {
  html = html.replaceAll(versaoAntiga, versao);
  // Atualiza descricao tambem
  html = html.replace(
    /<span class="versao-data">[^<]+<\/span>/,
    `<span class="versao-data">${versao} — ${manifest.description.slice(0, 80)}</span>`,
  );
  writeFileSync(instalarHtmlPath, html);
  console.log(`OK instalar.html atualizado: ${versaoAntiga} -> ${versao}`);
}

console.log(`
============================================================
PROXIMOS PASSOS:
1. git add downloads/pinguim-agentes-${versao}.zip instalar.html
2. git commit -m "release(extensao): ${versao}"
3. git push   (Vercel deploya automatico)

URL final pro socio baixar:
   https://mission-control-pink-three.vercel.app/instalar

URL direta do zip (pra testar):
   https://mission-control-pink-three.vercel.app/downloads/pinguim-agentes-${versao}.zip
============================================================
`);
