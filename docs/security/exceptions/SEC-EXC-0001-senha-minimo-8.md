# SEC-EXC-0001 — Senha com mínimo de 8 caracteres e composição (FR-011a)

Exceção de segurança no formato da ADR-0005 §9, registrada também em `exceptions.json`. Ela não altera nem remove o achado original: o achado continua
registrado no relatório da auditoria e volta a valer quando a exceção vencer.

| Campo | Valor |
|---|---|
| Identificador | `SEC-EXC-0001` |
| Achado relacionado | A07:2021, severidade `medium`, auditoria da sessão `f6ecfee5-e5f0-408f-9aff-f2f1cf2a1b09` (2026-11-08): `apps/api/src/modules/auth/password-reset.service.ts:70` e `apps/web/features/auth/schemas/forms.ts:34` |
| Requisitos relacionados | 001/FR-011a (emendas 2026-11-06 e 2026-11-08), 001/FR-029c; OWASP ASVS 4.0 V2.1.1 (mínimo de 12) e V2.1.9 (sem regras de composição) |
| Escopo | A senha nova escolhida no aceite de convite (professor, gestor e turma, inclusive CLAIM_ACCOUNT) e na redefinição de senha. A ativação de administrador continua em FR-011 (12–128, sem composição) e não está coberta por esta exceção. |
| Responsável pela aprovação | Responsável do projeto (EderAndrew), por decisão registrada na sessão de 2026-11-08 |
| Data da aprovação | 2026-11-08 (estende a aceitação de risco de 2026-11-06, que cobria só o convite e não tinha os campos desta seção) |
| Prazo de validade | 2027-05-08 |
| Data de revisão | 2027-05-08 |

## Justificativa técnica

O responsável do projeto definiu uma única regra de senha para todas as telas em que uma pessoa escolhe a própria
senha (convite e redefinição): de 8 a 128 caracteres, com pelo menos 1 letra maiúscula, 1 minúscula, 1 número e 1
caractere especial. É a regra que os usuários já conhecem do aceite de convite, e manter duas regras diferentes
(12 sem composição na redefinição, 8 com composição no convite) confundia quem recuperava a senha.

## Impacto potencial

Senhas mais curtas e previsíveis que cumprem a composição (por exemplo, uma palavra fora das listas com um número e
um símbolo) ficam mais fáceis de adivinhar do que uma senha de 12 caracteres. Uma amostra manual de 2026-11-06
mostrou 11 de 20 senhas previsíveis passando fora das listas. Vale para todas as contas, inclusive TEACHER e MANAGER,
que têm acesso a turmas, provas e notas.

## Medidas compensatórias

- Lista de senhas comuns (SecLists top 10 000) e lista de palavras em português (nomes, times, cidades, o nome do
  produto), comparadas depois de ignorar acentos, números, símbolos e substituições comuns (`P@ssw0rd1!`,
  `S3nh@2026!`), mais sequências de teclado e sequências numéricas (`apps/api/src/modules/identity/password-policy.ts`).
- Validação definitiva no backend, antes de consumir o link de redefinição.
- Limites de tentativas no login (por e-mail e origem, atraso progressivo e alerta) e na confirmação da redefinição.
- Link de redefinição de uso único, válido por 1 hora; a redefinição revoga todas as sessões da conta.
- Senhas guardadas só como hash (argon2).

## Na revisão

Reavaliar o mínimo de 12 caracteres (mantendo ou não a composição) e a consulta a uma base de senhas vazadas, que
exigiria spec própria. Se a exceção não for renovada até a data de revisão, ela perde a validade e o achado volta a
exigir correção.
