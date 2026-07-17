// diagnóstico: função SEM nenhuma dependência em lugar nenhum do arquivo
module.exports = (req, res) => {
  res.status(200).json({ ok: true, node: process.version, ts: Date.now() });
};
