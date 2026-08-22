# 🔌 Integração Unichat ↔ Bia (F4) — spec pro Andre montar os fluxos

> Arquitetura assíncrona (do jeito Unichat): o lead escreve → **Fluxo 1** manda
> pra Bia e recebe só um "recebido" na hora → a Bia pensa (RAG + LLM, 8-15s) →
> a Bia POSTa a resposta pronta no **Fluxo 2** ("Resposta da IA") → esse fluxo
> manda pro WhatsApp do lead. O bloco HTTP nunca fica travado esperando o LLM.

```
Lead responde no WhatsApp
      │  (tag: bia-ia · sem tag: comprador)
      ▼
┌─ FLUXO 1 (Unichat) ─────────────────────────┐
│ bloco HTTP request  ──POST──▶ edge Bia       │  ◀── ack 202 {recebido:true} na hora
└──────────────────────────────────────────────┘
                                     │ (Bia processa em background: memória+RAG+LLM)
                                     ▼
┌─ FLUXO 2 "Resposta da IA" (Unichat) ─────────┐
│ recebe POST da Bia  ──▶ envia bolhas pro lead │
└──────────────────────────────────────────────┘
```

## Endpoint da Bia (você chama no Fluxo 1)

```
POST https://wmelierxzpjamiofeemh.supabase.co/functions/v1/bia-vendas-proalt
Headers:
  Content-Type: application/json
  x-bia-token: <BIA_UNICHAT_TOKEN>
```

**A edge entende o formato NATIVO da Unichat direto** — não precisa customizar o body.
O objeto `contact` que a Unichat já envia é lido automaticamente (validado 2026-08-22
com o payload real):

```json
{
  "contact": {
    "name": "...",              → nome
    "phoneNumber": "5511...",   → telefone  (obrigatório)
    "email": "...",             → usado na trava de compra
    "tags": "bia-ia,bia-quero-saber-mais",   → DEFINE O EVENTO (ver abaixo)
    "lastMessage": "texto que o lead digitou",
    "lastMessageData": { "message": "...", "messageType": "message|image|audio" }
  }
}
```

> Se preferir controle explícito, dá pra mandar `"evento": "clique_me_conta_mais"`
> no corpo ou em `contact.fields.evento` — isso tem prioridade sobre a tag.

### Resposta imediata do endpoint (o que o Fluxo 1 recebe na hora)
- **HTTP 202** `{ "ok": true, "recebido": true, "modo": "async" }` → só significa
  "recebi, tô processando". **Não use isso pra responder o lead** — a resposta real
  chega pelo Fluxo 2. O bloco HTTP pode encerrar aqui.

## Eventos — definidos pela TAG que você marca (ou campo `evento`)

A Bia infere a intenção pela **tag do contato** (casa por substring, então o nome
exato do slug é flexível — só precisa CONTER a palavra-chave):

| Tag contém… | Evento | O que a Bia faz |
|---|---|---|
| `quero` / `saber-mais` / `conta-mais` | primeiro toque | Abre a conversa (reconexão), **não vende** |
| `mais-tarde` / `depois` / `chama` | me chama mais tarde | Responde curto e agenda retomada ~2h30 |
| `parar` / `nao-quero` / `optout` | parar avisos | Opt-out definitivo, despedida, nunca mais fala |
| _(sem tag de intenção)_ | mensagem normal | Fluxo de conversa/venda com o texto do lead |

Validado 2026-08-22: `bia-quero-saber-mais` → reconexão sem vender ✅ ·
`bia-parar-avisos` → optout ✅ · `bia-mais-tarde` → aguardando ✅.

> ⚠️ IMPORTANTE: o **primeiro contato** (quando o lead clica "quero saber mais" no
> template) TEM que vir com a tag de "quero" — senão a Bia trata a mensagem como
> conversa já em andamento. No teste inicial a tag era genérica (`tag1,tag2`) e a
> Bia interpretou "Eu quero" como intenção de compra e correu pro fechamento. Com a
> tag certa, ela abre com diagnóstico, como deve.
>
> `parar_avisos` e `chama_mais_tarde` a Bia responde **na hora** (não precisa de
> LLM). Os demais passam pelo Fluxo 2 (assíncrono) quando ele estiver configurado.

## O que a Bia POSTa no seu Fluxo 2 ("Resposta da IA")

Quando você me passar a URL do Fluxo 2, eu gravo em `bia_config.unichat_resposta_url`
e a Bia passa a POSTar isto lá, assim que a resposta fica pronta:

```json
{
  "telefone": "5511999998888",
  "nome": "Mariana",
  "mensagens": ["primeira bolha", "segunda bolha"],   ← ENVIE 1 POR VEZ, na ordem
  "resposta": "primeira bolha\n\nsegunda bolha",       ← tudo junto (se preferir 1 msg)
  "anexos": ["https://.../depoimento.jpg"],            ← imagens pra mandar (prova social)
  "lead_estado": "conversando",
  "etapa": "diagnostico"
}
```

- **`mensagens`**: array de bolhas curtas. O ideal no WhatsApp é enviar uma de cada
  vez (fica humano). Se seu fluxo só manda 1 texto, use `resposta`.
- **`anexos`**: quando a Bia decide mandar um print de depoimento, a URL vem aqui —
  seu Fluxo 2 manda como imagem. Vazio na maioria das vezes.
- **`lead_estado`**: se vier `humano` → transfira pro atendente e **pare o bot**
  desse contato. Se `optout`/`comprou`/`comprou_antes` → tire a tag `bia-ia`.

## Segurança (3 camadas — as 2 nossas + a sua)

1. **Sua (Unichat)**: só entra no fluxo quem tem tag `bia-ia` E não tem tag de comprador.
2. **Nossa (a cada mensagem)**: a edge checa em tempo real se o telefone/email já tem
   compra aprovada do ProAlt (Supabase do app, alimentado pelo webhook Hotmart) — se
   comprou por QUALQUER canal, a Bia para de vender na hora.
3. **Nossa (opt-out/humano)**: quem pediu pra parar ou pediu humano nunca mais recebe.

## Passo a passo pra ligar (quando você quiser)

1. Você publica o **template** na Meta (copy + 3 botões — te entrego a copy).
2. Cria a tag `bia-ia` e monta o **Fluxo 1** com o bloco HTTP acima.
3. Cria o **Fluxo 2** "Resposta da IA" e me passa a URL dele.
4. Eu: gravo a URL na config + o token no cofre + viro `followup_modo` e
   `unichat_resposta_url` pra ativo. A partir daí a Bia responde de verdade.
5. Teste ponta a ponta com nossos números (2-3 sócios) antes do disparo real.

## Estado atual
- Endpoint ✅ no ar, modo assíncrono ✅ implementado (só falta a URL do Fluxo 2).
- Hoje roda em **síncrono** (resposta no corpo) só pros meus testes internos.
- Falta de você: URL do Fluxo 2, template publicado, e o "ok" pra eu gravar o token
  no cofre (o guardião de segurança pediu sua autorização explícita pra isso).
