# Release da extensão Pinguim Agentes

Processo pra empacotar uma nova versão e publicar pros sócios baixarem.

## Quem usa essa página

A página `/instalar` (no domínio do Mission Control) é o ponto único onde sócios baixam e instalam a extensão. Substitui mensagens manuais por chat.

## Pré-requisitos

1. Pasta `c:/Pinguim-extensao/v<X.Y.Z>` com a versão pronta e testada
2. `manifest.json` dessa pasta com `"version": "X.Y.Z"` (sem o "v")
3. Estar dentro de `c:/Squad/mission-control`

## Como soltar uma versão (1 comando)

```bash
cd c:/Squad/mission-control
node scripts/release-extensao.js v0.24.0
```

O script:
1. Lê `c:/Pinguim-extensao/v0.24.0`
2. Confere se o manifest bate
3. Cria `downloads/pinguim-agentes-v0.24.0.zip`
4. Reescreve `instalar.html` apontando pra nova versão
5. Imprime os comandos de git pra commitar

## Como publicar (depois do script rodar)

```bash
git add downloads/pinguim-agentes-v0.24.0.zip instalar.html
git commit -m "release(extensao): v0.24.0"
git push
```

Vercel deploya automático. Em ~30s a página `/instalar` já mostra a versão nova.

## Como o sócio instala (passo a passo pra você mandar)

> Manda esse texto pra qualquer sócio que precisa instalar:

```
1. Abra: https://mission-control-pink-three.vercel.app/instalar
2. Clique em "Baixar pacote" (vai vir um zip)
3. Descompacte o zip numa pasta tipo C:\Pinguim-extensao\v0.24.0
4. Abra chrome://extensions no Chrome
5. Ligue "Modo do desenvolvedor" (canto superior direito)
6. Clique "Carregar sem compactação" (canto superior esquerdo)
7. Aponte pra pasta que você descompactou
8. Pronto — clica no ícone 🐧 na barra do Chrome
```

## Como o sócio atualiza quando sai versão nova

```
1. Abra https://mission-control-pink-three.vercel.app/instalar
2. Baixe o pacote novo
3. Descompacte POR CIMA da pasta antiga (sobrescreve)
4. Vai em chrome://extensions, clica no ícone ↻ do Pinguim
5. Pronto
```

## Backlog de versões antigas

`downloads/` tem zips de v0.6.1 até a atual. Não apagar — sócios podem precisar de rollback. Mas a página `/instalar` só aponta pra mais recente.

## Quando esse processo dá ruim

| Problema | Solução |
|---|---|
| Script falha "manifest != argumento" | Atualize a versão no manifest.json antes de rodar |
| Zip muito grande (>5MB) | Verifique se tem arquivos a mais na pasta (node_modules, .git) |
| Vercel não atualiza | Cache CDN — espera 1 min ou força com `?v=2` na URL |
| Sócio não consegue carregar | Confirme que o zip foi extraído (não está usando o zip direto) |
