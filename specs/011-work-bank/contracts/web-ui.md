# Contract: web UI

`apps/web/features/works/{api,components,hooks,schemas}`, apart from `features/exercises`;
design-system components only, Portuguese labels, axe and keyboard tests (SC-012 pattern of
the previous features) on every page. Menu item "Banco de Trabalhos" with `trabalhos.visualizar`,
next to "Banco de Exercícios".

| Route | Page |
|-------|------|
| `/trabalhos` | Bank: filters (disciplina, ementa, tópico, origem, situação, dificuldade, período de criação), title search, cursor pagination ("Carregar mais"); actions "Criar trabalho manualmente", "Criar trabalho com IA", "Pedidos de geração" |
| `/trabalhos/novo` | Manual work: disciplina, título, descrição, nota total ("0,50"), dificuldade (optional, "Sem dificuldade"), tópicos (ementa confirmada → itens por grupo, up to 10, optional); 1–10 question cards (React Hook Form field array: add, remove, move up/down), each with type, enunciado, explicação, tópicos da questão (0–3 of the work's), the type's fields (resposta esperada + rubrica; 3–5 alternativas with one "Correta" and "Pegadinha"; instruções, código inicial, solução esperada, linguagem, casos de teste with Pública/Privada); each card shows its computed "Vale 0,17" (`distributeGrade`); "Salvar como rascunho" / "Salvar e aprovar" (with the code-without-tests warning) |
| `/trabalhos/gerar` | AI request: Disciplina → Ementa (confirmed revisions) → Tópicos (checkboxes by group, 1–10); título, descrição, dificuldade (Básico / Intermediário / Avançado, required), nota total, quantidade 1–10, tipos (checkboxes), "Distribuir automaticamente" (shows the server's distribution) or "Definir quantidade por tipo", pegadinhas 0–3 only with Múltipla escolha; language shown read-only from the syllabus (Código disabled without it, with the hint); the limit "até 3 tópicos por questão" explained when exceeded; availability message and a link to the manual form when unavailable |
| `/trabalhos/pedidos` | The teacher's requests with status, configuration and the created work; "Pedir de novo" |
| `/trabalhos/pedidos/[id]` | One request: polling while PENDING; GENERATED links to the work; FAILED/CANCELLED shows that it failed and "Tentar de novo" |
| `/trabalhos/[id]` | View/edit one work (same form as the manual one, loaded): badges "Gerado por IA", "Editado por você", "Pegadinha", status; "Aprovar" (confirmation lists the warnings), "Arquivar" / "Restaurar", "Ver como aluno" (the student preview, read-only); a version conflict shows "Este trabalho mudou em outra aba" and reloads |

Labels: Básico, Intermediário, Avançado; Pergunta e resposta, Múltipla escolha, Código;
Rascunho, Aprovado, Arquivado; Manual, Gerado por IA; Pública, Privada. Grades shown with a
comma and two decimals ("0,17"). States never by color alone. Archiving uses `variant="danger"`
with explicit text and confirmation. The form's rules come from the contract schemas (no rule in
components); the server stays the authority.
