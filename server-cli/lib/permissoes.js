// ============================================================
// permissoes.js — V2.14 D Mapa role → tools permitidas
// ============================================================
// Define o que cada papel pode fazer. Funcionário (Categoria K) tem
// escopo OPERACIONAL: consulta tudo, opera Hotmart (com confirmação),
// mas NUNCA acessa Gmail/Calendar dos sócios, Meta, relatórios estratégicos.
//
// Decisão Andre 2026-05-11:
//   - Funcionários são atendentes que já têm acesso direto na Hotmart.
//     A gente só facilita o trabalho deles via bot.
//   - Confirmação antes só pra ação de RISCO REAL (regra autonomia >90%):
//     reembolso, cancelar assinatura, criar cupom, mensagem pública.
//
// Quando precisar customizar permissão de UM funcionário específico,
// preencher pinguim.discord_autorizados.permissoes (jsonb) com override.
// ============================================================

const PERMISSOES_POR_PAPEL = {
  socio: {
    // Tudo permitido — sócio tem acesso total
    todas: true,
  },

  funcionario: {
    todas: false,
    permitidas: {
      // Hotmart (Categoria G)
      'hotmart-consultar': true,            // G1
      'hotmart-listar-vendas': true,        // G2
      'hotmart-listar-reembolsos': true,    // G3
      'hotmart-verificar-assinatura': true, // G4
      'hotmart-verificar-acesso': true,     // G4b
      'hotmart-cadastrar-club': true,       // G4c
      'hotmart-reembolsar': true,           // G5 — exige confirmação (risco alto)
      'hotmart-cancelar-assinatura': true,  // G6 — exige confirmação (risco alto)
      'hotmart-cupom-criar': false,         // G7 — fica com sócio
      'hotmart-acesso-pendente': true,      // G8
      // Drive (Categoria E1/E2/E3)
      'drive-buscar': true,
      'drive-ler': true,
      'drive-editar': true,                 // edição confirma (regra padrão)
      // Discord (Categoria E8)
      'discord-listar-24h': true,
      'discord-buscar': true,
      'discord-postar': true,               // cross-canal (Categoria L)
      // Cross-canal — postar Discord, marcar funcionário/sócio
      'cross-canal-postar': true,
    },
    proibidas: {
      // Gmail (privado dos sócios)
      'gmail-listar': true,
      'gmail-ler': true,
      'gmail-responder': true,
      'gmail-modificar': true,
      // Calendar (privado dos sócios)
      'calendar-listar': true,
      'calendar-ler-evento': true,
      // WhatsApp externo (em nome da empresa)
      'whatsapp-enviar': true,
      // Meta (estratégia/financeiro)
      'meta-listar-ad-accounts': true,
      'meta-listar-campanhas': true,
      'meta-insights-campanha': true,
      'meta-listar-pages': true,
      'meta-inspecionar-token': true,
      'meta-renovar-token': true,
      // Relatórios (privados/estratégicos)
      'relatorio-gerar': true,
      'relatorio-criar': true,
      'relatorio-desativar': true,
      // Preferências do agente (Categoria J)
      'aprendizados-adicionar-geral': true,
      'aprendizados-adicionar-pessoal': true, // funcionário não muda config
    },
  },

  // Nota: 'cliente externo' foi removido 2026-05-11 — Andre confirmou que Discord
  // Pinguim é fechado por convite, todo membro do server vira 'funcionario'
  // automaticamente. Não há caso de uso 'cliente' por enquanto.
};

// Tools que SEMPRE exigem confirmação humana antes de executar (regra-mãe autonomia)
const TOOLS_RISCO_REAL = new Set([
  'hotmart-reembolsar',              // dinheiro sai
  'hotmart-cancelar-assinatura',     // irreversível, perde MRR
  'hotmart-cupom-criar',             // afeta marketing/financeiro
  'gmail-responder',                 // mensagem em nome do sócio
  'whatsapp-enviar',                 // mensagem em nome da empresa
  'drive-editar',                    // sobrescreve dados
  // Cross-canal NÃO entra aqui — regra autonomia: posta direto se não é dinheiro/exclusão.
]);

function podeUsar(papel, tool) {
  const config = PERMISSOES_POR_PAPEL[papel];
  if (!config) return false;
  if (config.todas === true) return true;
  if (config.proibidas && config.proibidas[tool]) return false;
  if (config.permitidas && config.permitidas[tool] === true) return true;
  return false; // default deny
}

function exigeConfirmacao(tool) {
  return TOOLS_RISCO_REAL.has(tool);
}

function permissoesPorPapel(papel) {
  return PERMISSOES_POR_PAPEL[papel] || null;
}

module.exports = {
  podeUsar,
  exigeConfirmacao,
  permissoesPorPapel,
  PERMISSOES_POR_PAPEL,
  TOOLS_RISCO_REAL,
};
