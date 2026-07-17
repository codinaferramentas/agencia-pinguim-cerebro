// diagnóstico: função mínima pra isolar problemas do runtime /api
module.exports = (req, res) => {
  let chromiumStatus = 'não testado';
  if (req.query && req.query.deps === '1') {
    try {
      const chromium = require('@sparticuz/chromium-min');
      chromiumStatus = 'ok (' + typeof chromium.executablePath + ')';
    } catch (e) {
      chromiumStatus = 'ERRO: ' + e.message.slice(0, 200);
    }
  }
  res.status(200).json({ ok: true, node: process.version, chromium: chromiumStatus });
};
