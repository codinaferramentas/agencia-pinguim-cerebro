// ============================================================
// /api/html-para-pdf — conversão HTML → PDF (Chrome headless)
// ============================================================
// Usada pelo Book Comercial 365: o worker sobe o HTML no bucket
// book-html do Supabase e chama aqui com { url } pra receber o PDF.
//
// Segurança sem env var: só renderiza URLs do NOSSO Supabase
// (prefixo fixo abaixo). Se um dia quiser endurecer mais, defina
// PDF_TOKEN nas env vars do Vercel — aí o header x-pdf-token
// passa a ser exigido também.
//
// Roda no mesmo projeto Vercel do Mission Control (deploy por git,
// site estático não é afetado — package.json não tem build script).
// ============================================================

const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

const PREFIXOS_PERMITIDOS = [
  'https://wmelierxzpjamiofeemh.supabase.co/storage/',
];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, erro: 'Use POST' });
    return;
  }

  const tokenEsperado = process.env.PDF_TOKEN || '';
  if (tokenEsperado && (req.headers['x-pdf-token'] || '') !== tokenEsperado) {
    res.status(401).json({ ok: false, erro: 'token invalido' });
    return;
  }

  const { url } = req.body || {};
  if (!url || !PREFIXOS_PERMITIDOS.some((p) => String(url).startsWith(p))) {
    res.status(400).json({ ok: false, erro: 'url obrigatoria e restrita ao Storage do Pinguim OS' });
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
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 45000 });
    try { await page.evaluateHandle('document.fonts.ready'); } catch (_) { /* fontes são best-effort */ }

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
    if (browser) try { await browser.close(); } catch (_) { /* já fechado */ }
  }
};
