# Syllabus Processing Contract: 004

Fluxo de um documento de ementa do envio ao conteúdo confirmado (E6–E11).

```text
POST multipart ──► inspeção (worker thread, 10 s) ──✗──► 400/413, nada gravado
                         │ ok
                         ▼
   transação: stored_files + syllabus_documents(UPLOADED) + syllabus.uploaded
                         │ commit → worker.kick()
                         ▼
   SyllabusProcessingWorker.runOnce(now)
     reserva (FOR UPDATE SKIP LOCKED): UPLOADED vencido | PROCESSING com lease vencido
     → PROCESSING, attempts+1, lease = now + 3 min
                         │
                         ▼
   extração (worker thread, 120 s, 256 MB)
     ├─ ok ─────────────► PROCESSED(TEXT | NO_TEXT), extraction, syllabus.processed
     ├─ UNREADABLE ─────► FAILED, syllabus.processing_failed
     └─ TIMEOUT/INTERNAL ► attempts < 3 ? UPLOADED (espera 1 min, 5 min) : FAILED
                         │
                         ▼
   professor: revisão EXTRACTION (se TEXT) ou MANUAL (qualquer situação)
     → PUT rascunho … → confirm → CONFIRMED (imutável), syllabus.revision_confirmed
                         │
                         ▼
   PUT /classes/:id/plan/syllabus → planejamento usa a revisão confirmada
```

## Mensagens entre a API e o worker thread

| Direção | Forma |
|---------|-------|
| API → worker | `{task: "inspect" \| "extract", bytes: ArrayBuffer (transferido), declaredMediaType, extension}` |
| worker → API (inspect) | `{ok: true, mediaType, pageCount: number\|null} \| {ok: false, code: FILE_* }` |
| worker → API (extract) | `{ok: true, result: "TEXT" \| "NO_TEXT", extraction: SyllabusExtraction} \| {ok: false, category: "UNREADABLE" \| "INTERNAL"}` |
| prazo esgotado | a API chama `terminate()` e registra `TIMEOUT` |

O worker não importa Prisma, config, logger nem módulos de rede; recebe bytes e devolve
dados. Textos extraídos nunca são logados.

## Configuração

| Variável | Padrão | Efeito |
|----------|--------|--------|
| `SYLLABUS_MAX_FILE_MB` | 10 | limite do multer e do contrato |
| `SYLLABUS_PROCESSING_INTERVAL_SECONDS` | 10 | intervalo do worker; `0` desliga o processamento, inclusive o disparo logo após o envio (`kick()`); envios continuam e ficam `UPLOADED` |
| `SYLLABUS_PROCESSING_TIMEOUT_SECONDS` | 120 | prazo por tentativa de extração |
| `RATE_LIMIT_SYLLABUS_UPLOADS_HOURLY` | 20 | envios por professor por hora |
| `RATE_LIMIT_SYLLABUS_RETRIES_HOURLY` | 10 | "Tentar novamente" por professor por hora |

## Extração (versão 1)

Regras em [research.md](../research.md) E10. Teste de ouro: a ementa de POO em PDF e
DOCX (`apps/api/test/fixtures/syllabus/poo.pdf`, `poo.docx`) produz exatamente o conteúdo de `poo.expected.json`, resumido abaixo (textos cortados com `…`):

```json
{
  "extractorVersion": 1,
  "title": "Object-Oriented Programming",
  "syllabusText": "Exploração dos princípios da programação orientada a objetos…",
  "competencyText": "Capacitar os alunos a projetar e implementar…",
  "groups": [
    {"title": "Fundamentos de POO", "items": ["Conceitos de classes, objetos e métodos", "Encapsulamento, herança e polimorfismo", "Associações e composição de objetos", "Diferença entre programação estruturada e orientada a objetos"]},
    {"title": "Padrões de Design em POO", "items": ["Princípios de design orientado a objetos (SOLID)", "Aplicação de padrões de projeto em POO", "Design para reutilização e extensibilidade", "Refatoração de código orientado a objetos"]},
    {"title": "POO em Ambientes Reais", "items": ["Persistência de objetos com ORM", "Gerenciamento de exceções e erros", "Introdução a bibliotecas para POO", "Integração de testes unitários"]},
    {"title": "Práticas de Implementação", "items": ["Modularização e organização de código", "Controle de acesso com modificadores", "Desenvolvimento de hierarquias de classes", "Manutenção e documentação"]}
  ]
}
```
