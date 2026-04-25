/* Doc: Personas */

export async function gerar() {
  return {
    titulo: 'Personas',
    lede: 'O dossiê de 11 blocos sobre quem compra de você. Gerado automaticamente pelo Cérebro, editável bloco a bloco, versionado a cada mudança.',
    secoes: [
      {
        id: 'o-que-e',
        titulo: 'O que é uma Persona',
        html: `
          <p>Persona não é template genérico de marketing. É um <strong>dossiê profundo e específico</strong> sobre quem compra um produto, escrito em linguagem de negócio.</p>
          <p>Cada produto da Pinguim tem a sua própria Persona, derivada do Cérebro daquele produto. A Persona do Elo não é igual à Persona do ProAlt — porque os alunos são diferentes, os jobs-to-be-done são diferentes, as dores são diferentes.</p>
        `,
      },
      {
        id: 'os-11-blocos',
        titulo: 'Os 11 blocos da Persona',
        html: `
          <p>Toda Persona é estruturada em 11 blocos. Não é arbitrário — cada bloco responde uma pergunta crítica de negócio:</p>
          <ol>
            <li><strong>Identidade</strong> — quem é (nome, idade, profissão, cidade, contexto familiar)</li>
            <li><strong>Rotina</strong> — como o dia acontece</li>
            <li><strong>Nível de consciência</strong> (Schwartz) — onde está na escada de awareness do produto</li>
            <li><strong>Jobs to be done</strong> — o que de fato está tentando resolver</li>
            <li><strong>Vozes na cabeça</strong> — diálogo interno, dúvidas que se repete</li>
            <li><strong>Desejos reais</strong> — o que quer mas não diz em voz alta</li>
            <li><strong>Crenças limitantes</strong> — o que a impede de agir</li>
            <li><strong>Dores latentes</strong> — sofrimentos que ainda não tem palavras</li>
            <li><strong>Objeções de compra</strong> — o que ela vai dizer pra não comprar</li>
            <li><strong>Vocabulário</strong> — palavras que ela usa de verdade (não as nossas)</li>
            <li><strong>Onde vive</strong> — canais, fontes de informação, comunidades</li>
          </ol>
          <p>Esse formato é fixo. Toda Persona, de todo produto, segue a mesma estrutura — facilita comparar, treinar agentes, e gerar copy reutilizando blocos específicos.</p>
        `,
      },
      {
        id: 'como-e-gerada',
        titulo: 'Como a Persona é gerada',
        html: `
          <p>A Persona é <strong>output do Cérebro</strong>. Quando o usuário clica em "Gerar agora" no painel de uma Persona:</p>
          <ol>
            <li>O sistema puxa todas as fontes do Cérebro daquele produto (depoimentos, objeções, sacadas, aulas, páginas)</li>
            <li>Manda esse contexto pra IA com um prompt estruturado em 11 blocos</li>
            <li>Recebe o dossiê preenchido e salva no banco</li>
            <li>O processo demora de 10 a 30 segundos, e durante esse tempo o Squad de agentes trabalha animado na tela (Diretoria delibera, Aurora consolida, Codina otimiza)</li>
          </ol>
          <p>Quanto mais alimentado o Cérebro, mais precisa a Persona. Cérebro com 5 fontes gera persona genérica; Cérebro com 50 fontes gera persona com voz própria, vocabulário real, objeções específicas.</p>
        `,
      },
      {
        id: 'edicao',
        titulo: 'Edição manual com proteção',
        html: `
          <p>A Persona não é caixa-preta da IA. Cada um dos 11 blocos tem botão "Editar". A pessoa pode reescrever, ajustar, refinar.</p>
          <p>Aqui está a inteligência: quando o bloco é editado manualmente, o sistema marca aquele campo como <code>editado</code>. Se a Persona for regenerada depois (porque o Cérebro recebeu material novo), <strong>os blocos editados manualmente são preservados</strong>. A IA atualiza só o que ainda está automático.</p>
          <p>Isso resolve o conflito clássico de "regenerei e perdi minha edição".</p>
        `,
      },
      {
        id: 'versionamento',
        titulo: 'Versionamento automático',
        html: `
          <p>Toda mudança real numa Persona cria uma nova versão. "Mudança real" tem regra: se você gera uma Persona e o resultado for igual ao da geração anterior (porque nada novo entrou no Cérebro), <strong>não cria versão duplicada</strong>.</p>
          <p>O painel oferece três operações sobre o histórico:</p>
          <ul class="docs-list">
            <li><strong>Listar versões</strong> — ver todas as versões da Persona ao longo do tempo</li>
            <li><strong>Comparar</strong> — ver lado a lado o que mudou entre duas versões</li>
            <li><strong>Restaurar</strong> — voltar pra uma versão anterior, se a nova ficou pior</li>
          </ul>
          <p>O export em PDF estruturado em A4 está disponível pra qualquer versão.</p>
        `,
      },
    ],
    pitch: `
      <p>Persona genérica de PowerPoint não converte. Persona derivada de fonte real, com vocabulário do aluno, com objeção que ele de fato fez — essa converte.</p>
      <p>Quando o time da Pinguim escreve copy baseada na Persona do sistema, a copy nasce <strong>com voz da marca e dor real do aluno</strong>. Quando agente IA escreve, a saída tem precisão de quem leu 100 depoimentos. Esse é o salto de qualidade que justifica o investimento numa plataforma como o Pinguim OS.</p>
    `,
  };
}
