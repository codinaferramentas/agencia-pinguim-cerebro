/* Doc: Integracoes */

export async function gerar() {
  return {
    titulo: 'Integrações',
    lede: 'Serviços externos que o Pinguim OS pode usar pra ampliar o que entra no Cérebro. Configure a chave uma vez no painel — o sistema decide sozinho quando usar.',
    secoes: [
      {
        id: 'conceito',
        titulo: 'Por que integrações',
        html: `
          <p>O Cérebro come tudo que a Pinguim consegue alimentar — incluindo conteúdo que vive em plataformas externas. Vídeo no YouTube, post viral no Instagram, áudio de Reels do Micha. Esses materiais são valiosos pra Persona e pra cópia, mas estão fora dos arquivos da pasta do Drive.</p>
          <p>O módulo Integrações resolve isso plugando o sistema em serviços externos via chave de API. Você configura uma vez, o sistema usa em segundo plano, sem você precisar fazer download manual ou copy-paste.</p>
        `,
      },
      {
        id: 'integracoes-disponiveis',
        titulo: 'O que está disponível',
        html: `
          <h3>Inteligência Artificial</h3>
          <ul class="docs-list">
            <li><strong>OpenAI</strong> — Vision (OCR de imagem e PDF gráfico), Whisper (transcrição de áudio), GPT (classificação e geração), Embeddings (busca semântica). Configurada via servidor, sempre ativa.</li>
          </ul>

          <h3>Captação de Conteúdo</h3>
          <ul class="docs-list">
            <li><strong>YouTube · legendas oficiais</strong> — extrai legendas geradas automaticamente pelo YouTube. Sem chave, sem custo. Funciona em ~95% dos vídeos.</li>
            <li><strong>Leitura direta de página HTML</strong> — pra páginas de venda, blog, artigo. Sem chave, sem custo. Funciona em ~95% das páginas tradicionais (Hotmart, Eduzz, Kiwify, landing pages, blogs).</li>
            <li><strong>Apify (Instagram, TikTok, YouTube, Site SPA, Meta Ads Library)</strong> — um token só, todos os atores. O sistema escolhe automaticamente o ator certo conforme o domínio da URL. Conta em apify.com com US$ 5 grátis por mês — cobre milhares de Reels.</li>
          </ul>
          <p style="font-size:0.875em;color:var(--fg-muted)">Cascata inteligente: pra URL "site genérico" o sistema tenta primeiro leitura direta de HTML (grátis). Só cai pro Apify <code>website-content-crawler</code> se a página for SPA (React/Vue), bloquear bot ou retornar texto vazio. Pra Reels do Instagram, usa <code>apify/instagram-scraper</code>; TikTok usa <code>clockworks/free-tiktok-scraper</code>; Meta Ads Library usa <code>curious_coder/facebook-ads-library-scraper</code>; YouTube usa <code>streamers/youtube-scraper</code> só como fallback de legendas. Você só precisa ter <strong>um</strong> token configurado — o resto o sistema resolve.</p>

          <h3>Infraestrutura</h3>
          <ul class="docs-list">
            <li><strong>Supabase</strong> — banco, Storage e autenticação do sistema. Sempre ativa.</li>
          </ul>
        `,
      },
      {
        id: 'como-configurar',
        titulo: 'Como configurar uma chave',
        html: `
          <p>No menu lateral, clique em <strong>🔌 Integrações</strong>. Encontre o card do serviço que quer ativar e clique em <strong>Configurar</strong>.</p>
          <p>O modal mostra os passos exatos pra obter a chave (geralmente: criar conta no serviço, copiar token da seção de API, colar). Depois de salvo, o card vira verde e o serviço fica disponível pra uso.</p>
          <p>A chave fica guardada no servidor e <strong>nunca é exposta ao navegador</strong>. Mesmo o painel só vê se a integração tem chave, não qual chave.</p>
        `,
      },
      {
        id: 'como-usar',
        titulo: 'Como o sistema usa as integrações',
        html: `
          <p>Você não precisa pensar nisso — o sistema decide sozinho:</p>
          <ul class="docs-list">
            <li>Cola URL do YouTube → tenta legendas oficiais (grátis); se não tiver, usa Apify YouTube Scraper.</li>
            <li>Cola URL do Instagram (Reel ou perfil) → Apify Instagram Scraper. Retorna caption + transcrição do áudio + métricas + comentários recentes.</li>
            <li>Cola URL do TikTok → Apify TikTok Scraper. Retorna caption + legendas + métricas.</li>
            <li>Cola URL de página de venda, blog ou artigo → tenta leitura direta de HTML (grátis); só cai pro Apify se a página for SPA ou bloquear bot.</li>
            <li>Cola URL da Biblioteca de Anúncios do Meta → Apify Facebook Ads Library Scraper. Espia anúncios ativos do concorrente.</li>
            <li>Sobe imagem ou áudio direto → OpenAI Vision/Whisper.</li>
          </ul>
          <p>Cada chamada é contabilizada por integração. No card, você vê o número de usos e o custo acumulado em reais — transparência total.</p>
        `,
      },
      {
        id: 'evolucao',
        titulo: 'Próximas integrações',
        html: `
          <p>O módulo é desenhado pra crescer. Próximas conexões previstas:</p>
          <ul class="docs-list">
            <li><strong>WhatsApp Business API</strong> — capturar áudios e mensagens de aluno em tempo real</li>
            <li><strong>Discord webhook</strong> — monitorar canais de depoimento</li>
            <li><strong>Telegram Bot API</strong> — mesma coisa pra grupos privados</li>
            <li><strong>Hotmart / Eduzz</strong> — sincronizar lista de alunos e métricas</li>
            <li><strong>Stripe</strong> — eventos de pagamento alimentando o Cérebro de vendas</li>
          </ul>
        `,
      },
    ],
    pitch: `
      <p>Sistema fechado morre sozinho. Sistema com integrações plugáveis cresce — cada nova conexão multiplica o que pode entrar no Cérebro sem precisar reescrever nada.</p>
      <p>Pra venda, isso vira argumento forte: "o Pinguim OS já se conecta com YouTube, Instagram, TikTok, OpenAI; e vai conectar com WhatsApp, Discord, Stripe". Cliente vê <strong>roadmap concreto</strong> e investe sabendo que o sistema acompanha o crescimento dele.</p>
    `,
  };
}
