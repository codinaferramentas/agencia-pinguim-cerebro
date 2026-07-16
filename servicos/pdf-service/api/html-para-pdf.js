// ============================================================
// pinguim-pdf — serviço de conversão HTML → PDF (Chrome headless)
// ============================================================
// POST /api/html-para-pdf
//   headers: x-pdf-token: <PDF_TOKEN>
//   body: { url: "https://..." }  (página a imprimir — signed URL do
//          Supabase Storage no caso do Book Comercial 365)
//   ou:   { html: "<...>" }       (só pra documentos pequenos, <4MB)
// Resposta: application/pdf (binário)
//
// Deploy: projeto Vercel próprio (pinguim-pdf), separado do
// mission-control de propósito — não interfere no site.
// ============================================================

const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, erro: 'Use POST' });
    return;
  }
  const esperado = process.env.PDF_TOKEN || '';
  const recebido = req.headers['x-pdf-token'] || '';
  if (!esperado || recebido !== esperado) {
    res.status(401).json({ ok: false, erro: 'token invalido' });
    return;
  }

  const { url, html } = req.body || {};
  if (!url && !html) {
    res.status(400).json({ ok: false, erro: 'informe url ou html' });
    return;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1080, height: 1528 },
      executablePath: await chromium.executablePath(),
      headless: 'shell',
    });
    const page = await browser.newPage();
    if (url) {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 45000 });
    } else {
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 45000 });
    }
    // garante webfonts carregadas antes de imprimir
    try { await page.evaluateHandle('document.fonts.ready'); } catch (_) {}

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '12mm', left: '9mm', right: '9mm' },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.status(200).send(Buffer.from(pdf));
  } catch (e) {
    console.error('[html-para-pdf]', e.message);
    res.status(500).json({ ok: false, erro: e.message });
  } finally {
    if (browser) try { await browser.close(); } catch (_) {}
  }
};
