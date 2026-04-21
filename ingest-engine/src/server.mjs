#!/usr/bin/env node
/**
 * Ponte HTTP local entre o painel Mission Control e o motor de ingestão.
 *
 * Uso: npm start
 * Abre servidor em http://localhost:4100
 *
 * Endpoints:
 *   POST /ingest   - recebe arquivo zip + metadados, dispara ingest em background
 *                    retorna lote_id pra frontend acompanhar
 *   GET  /lotes/:id  - devolve status + log em tempo real
 *   GET  /health   - healthcheck
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import chalk from 'chalk';

import { env } from '../lib/env.mjs';
import { supabase } from '../lib/supabase.mjs';
import { processarZip } from './engine.mjs';

const cfg = env();
const sb = supabase();
const PORT = 4100;

// CORS permissivo em localhost (o painel vive no vercel, mas usuário abre localhost no navegador dele)
function setCors(res, origin = '*') {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Filename, X-Cerebro-Slug, X-Filtro, X-Origem');
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ---------- GET /health ----------
  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      supabase: cfg.SUPABASE_URL,
      openai_key: cfg.OPENAI_API_KEY.slice(0, 7) + '…' + cfg.OPENAI_API_KEY.slice(-4),
    }));
    return;
  }

  // ---------- GET /produtos ----------
  if (url.pathname === '/produtos' && req.method === 'GET') {
    const { data, error } = await sb.from('produtos').select('id, slug, nome, emoji').order('nome');
    if (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  // ---------- POST /ingest ----------
  if (url.pathname === '/ingest' && req.method === 'POST') {
    const cerebroSlug = req.headers['x-cerebro-slug'];
    const filename = req.headers['x-filename'] || 'upload.zip';
    const filtro = req.headers['x-filtro'] || '';
    const origem = req.headers['x-origem'] || 'lote';

    if (!cerebroSlug) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'header X-Cerebro-Slug obrigatório' }));
      return;
    }

    // Busca cérebro
    const { data: prod } = await sb.from('produtos').select('id').eq('slug', cerebroSlug).maybeSingle();
    if (!prod) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'produto não encontrado: ' + cerebroSlug})); return; }
    const { data: cer } = await sb.from('cerebros').select('id').eq('produto_id', prod.id).maybeSingle();
    if (!cer) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'cérebro não encontrado'})); return; }

    // Grava arquivo num tmp
    const tmpDir = path.join(os.tmpdir(), 'pinguim-ingest');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, crypto.randomBytes(8).toString('hex') + path.extname(filename));

    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      fs.writeFileSync(tmpFile, buffer);
      console.log(chalk.dim(`  [server] recebi ${(buffer.length / 1024 / 1024).toFixed(1)} MB -> ${tmpFile}`));

      // Cria lote no banco (recebido)
      const { data: lote, error: eL } = await sb.from('ingest_lotes').insert({
        cerebro_id: cer.id,
        tipo: 'pacote_zip',
        status: 'recebido',
        nome_arquivo: filename,
        tamanho_bytes: buffer.length,
        disparado_por: 'painel',
        disparado_via: 'web',
      }).select('id').single();

      if (eL) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: eL.message }));
        return;
      }

      // Responde já com lote_id, processa em background
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ lote_id: lote.id, status: 'recebido' }));

      // Processa em background (sem await no response)
      processarZip({
        caminho: tmpFile,
        cerebroId: cer.id,
        loteId: lote.id,
        filtro,
        origem,
        onCleanup: () => {
          try { fs.unlinkSync(tmpFile); } catch {}
        }
      }).catch(err => {
        console.error(chalk.red(`[server] erro no lote ${lote.id}:`), err);
      });
    });

    req.on('error', (e) => {
      console.error(chalk.red('[server] erro upload:'), e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    });
    return;
  }

  // ---------- GET /lotes/:id ----------
  const matchLote = url.pathname.match(/^\/lotes\/([a-f0-9-]{36})$/);
  if (matchLote && req.method === 'GET') {
    const loteId = matchLote[1];
    const { data, error } = await sb
      .from('ingest_lotes')
      .select('id, status, nome_arquivo, arquivos_totais, fontes_criadas, chunks_criados, em_quarentena, custo_usd, duracao_ms, log_md, erro_detalhes, criado_em, finalizado_em')
      .eq('id', loteId)
      .single();
    if (error) {
      res.writeHead(404, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ error: error.message }));
      return;
    }
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify(data));
    return;
  }

  // ---------- GET /lotes/:id/arquivos ----------
  const matchLoteArqs = url.pathname.match(/^\/lotes\/([a-f0-9-]{36})\/arquivos$/);
  if (matchLoteArqs && req.method === 'GET') {
    const loteId = matchLoteArqs[1];
    const { data } = await sb
      .from('ingest_arquivos')
      .select('nome_original, tipo_sugerido, tipo_confianca, status, motivo_erro')
      .eq('lote_id', loteId)
      .order('criado_em', { ascending: true });
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify(data || []));
    return;
  }

  res.writeHead(404, {'Content-Type':'application/json'});
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(chalk.bold.green(`\n🚀 Pinguim Ingest Server`));
  console.log(chalk.dim(`   http://localhost:${PORT}`));
  console.log(chalk.dim(`   supabase: ${cfg.SUPABASE_URL}`));
  console.log(chalk.dim(`\n   Endpoints:`));
  console.log(chalk.dim(`     GET  /health`));
  console.log(chalk.dim(`     GET  /produtos`));
  console.log(chalk.dim(`     POST /ingest                (headers: X-Cerebro-Slug, X-Filename, X-Filtro, X-Origem)`));
  console.log(chalk.dim(`     GET  /lotes/:id`));
  console.log(chalk.dim(`     GET  /lotes/:id/arquivos`));
  console.log(chalk.dim(`\n   Aguardando uploads do painel Mission Control…\n`));
});
