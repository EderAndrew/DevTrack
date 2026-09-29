# Architecture Decision Records (ADR)

Registros das decisões de arquitetura do DevTrack, em português, como o restante da documentação.

## Papel das ADRs no projeto

As regras do DevTrack são normativas em dois lugares, nesta ordem de precedência:

1. a constituição (`.specify/memory/constitution.md`), que se sobrepõe a tudo;
2. as specs de cada feature (`specs/NNN-*/`: `spec.md`, `research.md`, `data-model.md`,
   `contracts/*`).

Uma ADR **registra** uma decisão arquitetural e aponta para essas fontes. Ela não cria nem altera
regras: quando uma ADR e uma spec ou a constituição divergirem, valem a spec e a constituição, e a
ADR deve ser corrigida. Mudar uma regra exige uma nova spec (`/speckit-specify`) ou uma emenda a uma
spec existente e, quando aplicável, uma emenda à constituição (`/speckit-constitution`); a ADR é
atualizada depois.

## Formato

Cada ADR é um arquivo `NNNN-titulo-curto.md` com:

- **Status**: `Proposta`, `Aceita`, `Substituída por ADR-NNNN` ou `Obsoleta`;
- **Data**, **Decisores**, **Escopo** e **Decisões normativas anteriores** (constituição e specs);
- contexto, decisão (o estado adotado), consequências, alternativas rejeitadas e decisões em
  aberto (mudanças futuras e o caminho que exigem).

Uma ADR aceita não é reescrita para mudar de decisão: uma nova ADR a substitui. Correções de fato
(um estado de catálogo, uma referência) podem ser feitas no próprio arquivo.

## Índice

| ADR | Título | Status | Data |
|-----|--------|--------|------|
| [0001](0001-ai-gateway-multi-model-architecture.md) | Arquitetura multimodelo de IA com AI Gateway, OpenRouter e Jev | Aceita | 2026-09-29 |
