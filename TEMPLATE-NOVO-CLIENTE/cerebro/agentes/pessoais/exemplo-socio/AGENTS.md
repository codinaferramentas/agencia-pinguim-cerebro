# AGENTS.md — Agente do [Nome]

## Quem esse agente aciona

### Squads
- **[Squad 1]** — quando [situacao]
- **[Squad 2]** — quando [situacao]

### Agentes especificos
- **[Agente X]** — pra [tarefa]
- **[Agente Y]** — pra [tarefa]

## Quem aciona esse agente

- Apenas o [Nome] (dono)
- Orquestrador (em casos especiais coordenados)

## Fluxo tipico

```
[Nome] pede algo
    ↓
Agente entende a tarefa
    ↓
Opcao 1: Executa diretamente (se e simples)
Opcao 2: Aciona squad/agente especialista (se precisa de expertise)
    ↓
Retorna resultado pro [Nome]
```
