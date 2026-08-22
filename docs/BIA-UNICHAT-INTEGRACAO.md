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
  x-bia-token: <BIA_UNICHAT_TOKEN>     ← te passo em canal seguro (fica no cofre)
Body (JSON) — mapeie as variáveis da Unichat:
  {
    "telefone": "{{contato.telefone}}",        (obrigatório, qualquer formato BR)
    "nome": "{{contato.nome}}",                 (opcional)
    "mensagem": "{{mensagem.texto}}",           (o que o lead escreveu)
    "midia_url": "{{mensagem.midia_url}}",      (se o lead mandou áudio/imagem)
    "evento": "clique_me_conta_mais"            (ver tabela de eventos abaixo)
  }
```

### Resposta imediata do endpoint (o que o Fluxo 1 recebe na hora)
- **HTTP 202** `{ "ok": true, "recebido": true, "modo": "async" }` → só significa
  "recebi, tô processando". **Não use isso pra responder o lead** — a resposta real
  chega pelo Fluxo 2. O bloco HTTP pode encerrar aqui.

## Eventos (campo `evento`)

| Quando | `evento` | O que a Bia faz |
|---|---|---|
| Lead clicou **"Quero saber mais"** no template | `clique_me_conta_mais` | Abre a conversa (reconexão), sem `mensagem` |
| Lead clicou **"Me chama mais tarde"** | `chama_mais_tarde` | Responde curto e agenda retomada em ~2h30 (o worker cuida) |
| Lead clicou **"Não quero"** / opt-out | `parar_avisos` | Marca opt-out, despedida, nunca mais fala |
| Lead **escreveu/mandou áudio/imagem** | `mensagem` (ou omita) | Fluxo normal de venda |

> Os 3 primeiros são disparados pelos **botões do template**. O `mensagem` é toda
> resposta livre subsequente. Para `parar_avisos`/`chama_mais_tarde` a Bia devolve
> a bolha **na hora** (HTTP 200, síncrono) porque não precisa de LLM — se quiser,
> pode usar essa resposta direto no Fluxo 1. Pros demais, sempre via Fluxo 2.

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
