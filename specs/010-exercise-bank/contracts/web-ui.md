# Contract: web UI

`apps/web/features/exercises/{api,components,hooks,schemas}`; design-system components only,
Portuguese labels, axe and keyboard tests (SC-012 pattern) on every page. Menu item "Banco de
Exercícios" with `questoes.visualizar`.

| Route | Page |
|-------|------|
| `/exercicios` | Bank: filters (disciplina, ementa, tópico, dificuldade, objetivo, tipo, origem, situação, linguagem), search, cursor pagination ("Carregar mais"), actions "Criar manualmente", "Criar com IA", "Novo exercício" |
| `/exercicios/novo` | Manual set: 3–10 exercise cards (React Hook Form field array), per card type, difficulty, objective, optional topic, type fields; "Salvar como rascunho" / "Salvar no banco" |
| `/exercicios/novo/avulso` | One exercise, same form |
| `/exercicios/gerar` | AI request: Disciplina → Ementa (confirmed revisions) → Tópico (items by group); dificuldade; total 3–10; tipos (checkboxes); "Distribuir automaticamente" (shows the server's distribution) or "Definir quantidade por tipo"; pegadinhas 0–3 only with Múltipla escolha; language shown read-only from the syllabus (code disabled without it, with the hint); availability message when unavailable |
| `/exercicios/lotes` | The teacher's batches with status |
| `/exercicios/lotes/[id]` | Batch review: status (polling while PENDING), each draft editable inline, "Excluir", "Aprovar", "Aprovar selecionados", "Gerar de novo"; badges "Gerado por IA", "Editado por você", "Pegadinha" with text + icon |
| `/exercicios/[id]` | View/edit one exercise; archive/restore |

Syllabus review page (004): "Linguagem" select with the catalog (or "Nenhuma"). Curriculum
proposal page (007): "Linguagem" as an acceptable field with the unsupported-content warning.

Labels: Básico, Intermediário, Avançado; Reconhecer, Compreender, Aplicar, Analisar, Criar;
Pergunta e resposta, Múltipla escolha, Exercício de código; Rascunho, Aprovado, Arquivado;
Manual, Gerado por IA. States never by color alone. Deleting/archiving uses `variant="danger"`
with confirmation.
