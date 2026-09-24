# Quickstart: 004 — Área do Professor: Disciplinas, Ementas, Calendário e Tópicos

Roteiro para validar a feature depois da implementação. Ambiente e pré-requisitos: os
mesmos da 003 (`specs/003-class-invitations-enrollment/quickstart.md`). Rode `pnpm build`
antes de comandos filtrados. Arquivos de exemplo: `apps/api/test/fixtures/syllabus/`.

## 1. Subir e migrar

```bash
docker compose up -d postgres postgres-test mailpit
pnpm install && pnpm build
pnpm --filter api prisma migrate deploy      # disciplinas, ementas, arquivos, encontros, planejamentos, tópicos, permissões
pnpm dev                                     # web :3000, API :4000
```

Esperado: migração aplicada; o menu de um professor mostra "Minhas disciplinas"; o de um
administrador sem papel de professor, não.

## 2. Disciplina e turma como oferta (US1)

Em `/disciplinas` → "Nova disciplina": "Programação Orientada a Objetos". Tente
"programação orientada a objetos " → "Você já tem uma disciplina com este nome.". Na
disciplina → "Nova turma": `POO-2027-A`, 2027, período "2027.1", 01/02/2027 a
30/06/2027. Abra uma turma antiga da 003: as abas Ementa/Calendário/Planejamento pedem
disciplina e datas; ligue-a à disciplina e informe as datas.

## 3. Envio e segurança (US2)

Na turma `POO-2027-A` → Ementa → "Enviar ementa" → `poo.pdf`. A situação passa de
"Enviado" a "Processando" e "Processado" sem recarregar. Envie de novo o mesmo arquivo →
"Este arquivo já foi enviado (versão 1).". Tente, um por vez: `executavel.pdf`,
um arquivo acima de 10 MB (`head -c 10485761 /dev/zero > /tmp/grande.pdf`; recusado já no
navegador com "O arquivo passa de 10 MB."), `macro.docx`, `bomba.docx`, `protegido.pdf`,
`truncado.jpg` → cada um recusado com a mensagem do contrato e nenhuma versão nova. "Baixar original" e
compare: `shasum -a 256 poo.pdf ~/Downloads/poo.pdf` iguais.

## 4. Revisão e confirmação (US3)

Abra a versão 1: 4 grupos e 16 itens da ementa de POO, título, ementa e competência
(contracts/syllabus-processing.md). Corrija um item, mova outro para outro grupo, salve,
saia e volte (rascunho mantido). "Confirmar conteúdo" → "Conteúdo confirmado." → "Usar
esta ementa na turma <nome da turma POO-2027-A>?" → "Usar ementa" (o diálogo aparece quando a
versão foi aberta a partir da turma, que ainda não usa ementa). Tente editar a revisão confirmada → não é
editável; "Nova revisão" cria rascunho a partir dela.

Imagem: envie `ementa.png` → "Não foi possível ler o texto deste arquivo. Preencha o
conteúdo manualmente." com a imagem ao lado; preencha dois grupos e confirme.

Kill switch: reinicie a API com `SYLLABUS_PROCESSING_INTERVAL_SECONDS=0`, envie
`poo.docx` → fica "Enviado"; volte ao padrão → processa.

## 5. Calendário (US4)

Turma → Calendário: marque as quartas-feiras de 03/02 a 09/06/2027 (19 datas), deixando
17/03 de fora → "Total de aulas selecionadas: 18" e encontros 1–18. Acrescente uma data no meio →
renumeração.

## 6. Tópicos (US5, US6)

Planejamento → "Novo tópico" sem ementa confirmada em outra turma → "Envie e confirme a
ementa antes de criar tópicos.". Na `POO-2027-A`: crie tópicos para as aulas 01–06
escolhendo itens; em "Cobertura da ementa", "Criar tópico com este item" preenche o
título. Junte "Herança" e "Modificadores de acesso" → um tópico com os dois itens, o
outro nos arquivados. Divida "SOLID" em três. Arquive "Introdução a bibliotecas para
POO" → o item aparece como não coberto; restaure. Reordene com "Subir"/"Descer" e mude a
aula de um tópico só com o teclado.

Conflito: abra o planejamento em duas abas, salve um tópico numa e tente salvar na outra
→ mensagem de conflito, nada perdido.

Remoção de data: no calendário, desmarque a aula 05 (com tópico) → diálogo com as quatro
escolhas; escolha "Deixar sem data" → o tópico aparece em "Sem data", nenhum apagado.

## 7. Situação do planejamento (US7)

"Confirmar planejamento" → "Pronto", tópicos ativos. "Reabrir" → rascunho. Confirme de
novo, "Iniciar" → "Em andamento"; edite um tópico (aceito e auditado). "Arquivar
planejamento" → tudo somente leitura.

## 8. Isolamento (US8)

Com outro professor, abra as URLs da disciplina, do documento
(`/api/syllabus-documents/<id>/file`), da revisão e do planejamento → "não encontrado".
Com o administrador (sem papel de professor): `/disciplinas` e as rotas da API → 403.

## 9. Testes

```bash
pnpm --filter api test -- test/integration/004-      # histórias 004
pnpm --filter api test:security                     # matriz, isolamento, uploads hostis, segredos, auditoria
pnpm --filter web test
pnpm --filter web test:e2e                          # syllabus-plan, syllabus-manual, syllabus-upload-limit (+ jornadas anteriores)
```
