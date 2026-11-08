# Exceções de segurança

Aceitações de risco aprovadas por uma pessoa, no formato da ADR-0005 §9. Cada exceção tem:

1. um documento `SEC-EXC-NNNN-<assunto>.md` com o achado, a justificativa, o impacto, as medidas compensatórias, o
   responsável, a data da aprovação, a validade e a data de revisão;
2. uma entrada em `exceptions.json` que a política do hook lê (`id`, `rule`, `maxSeverity`, `files`, `approvedBy`,
   `approvedAt`, `validUntil`, `document`).

A exceção só vale depois de mesclada em `main` por pull request revisado e enquanto não vencer, e nunca para um achado
mais grave que `maxSeverity`; um achado a usa citando o `id` no campo `exception` (ADR-0005 §9, "Exceções reconhecidas
pela política automatizada"). Para renovar, atualize `validUntil` e a data de revisão nos dois lugares e mescle de novo;
uma exceção vencida não é apagada, fica como histórico.

| Exceção | Achado | Validade |
|---|---|---|
| [SEC-EXC-0001](SEC-EXC-0001-senha-minimo-8.md) | A07:2021, senha de 8 caracteres com composição (FR-011a) | 2027-05-08 |
