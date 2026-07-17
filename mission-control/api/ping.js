// diagnóstico: função mínima pra isolar problemas do runtime /api
module.exports = async (req, res) => {
  const out = { ok: true, node: process.version };
  if (req.query && req.query.deps === '1') {
    try {
      const chromium = require('@sparticuz/chromium-min');
      out.chromium = 'ok (' + typeof chromium.executablePath + ')';
    } catch (e) {
      out.chromium = 'ERRO: ' + e.message.slice(0, 200);
    }
  }
  if (req.query && req.query.extract === '1') {
    try {
      const fs = require('fs');
      const chromium = require('@sparticuz/chromium-min');
      const PACK = 'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar';
      out.execPath = await chromium.executablePath(PACK);
      out.ld_library_path = process.env.LD_LIBRARY_PATH || '(vazio)';
      out.tmp = fs.readdirSync('/tmp').slice(0, 20);
      try { out.al2023 = fs.readdirSync('/tmp/al2023').slice(0, 10); } catch (e) { out.al2023 = 'ausente: ' + e.code; }
      try { out.tmp_lib = fs.readdirSync('/tmp/lib').slice(0, 15); } catch (e) { out.tmp_lib = 'ausente: ' + e.code; }
      out.fontconfig = !!process.env.FONTCONFIG_PATH;
    } catch (e) {
      out.extract = 'ERRO: ' + e.message.slice(0, 300);
    }
  }
  res.status(200).json(out);
};
