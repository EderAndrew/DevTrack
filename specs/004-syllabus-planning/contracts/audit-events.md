# Audit Events Contract: 004 — Área do Professor

Acrescenta tipos aos catálogos das fases 001 e 003, com as mesmas regras: gravados na
mesma transação da operação, tabela append-only, `metadata` só com as chaves listadas
(allowlist em `audit-event-types.ts`). **Nunca** textos da ementa, títulos ou descrições
de tópicos, nomes de disciplina, nomes de arquivo nem conteúdo do documento (FR-047).
`audit-coverage.spec.ts` lê os três catálogos.

| `type` | Ator | Alvo | `metadata` permitido | Origem |
|--------|------|------|----------------------|--------|
| `subject.created` | USER | SUBJECT | — | FR-002 |
| `subject.updated` | USER | SUBJECT | `fields`, `status` (se mudou) | FR-002 |
| `class.offering_updated` | USER | CLASS | `fields` (`subjectId`, `period`, `startsOn`, `endsOn`), `subjectId` | FR-003 |
| `syllabus.uploaded` | USER | SYLLABUS_DOCUMENT | `subjectId`, `version`, `mediaType`, `sizeBytes` | FR-006 |
| `syllabus.processed` | SYSTEM | SYLLABUS_DOCUMENT | `result` (`TEXT`\|`NO_TEXT`), `groupCount`, `itemCount`, `attempts`, `extractorVersion` | FR-014 |
| `syllabus.processing_failed` | SYSTEM | SYLLABUS_DOCUMENT | `category`, `attempts` | FR-015 |
| `syllabus.revision_confirmed` | USER | SYLLABUS_REVISION | `documentId`, `number`, `source`, `groupCount`, `itemCount` | FR-023 |
| `class_meetings.updated` | USER | CLASS | `added`, `removed`, `total`, `resolutions` (quantidade por ação) | FR-025, FR-029 |
| `topic.created` | USER | TOPIC | `planId`, `itemCount`, `hasMeeting` | FR-035 |
| `topic.updated` | USER | TOPIC | `planId`, `fields` | FR-035 |
| `topic.merged` | USER | TOPIC | `planId`, `mergedTopicIds` | FR-036 |
| `topic.split` | USER | TOPIC | `planId`, `newTopicIds` | FR-037 |
| `topic.archived` | USER | TOPIC | `planId`, `reason` (`TEACHER`\|`MEETING_REMOVED`) | FR-038 |
| `topic.restored` | USER | TOPIC | `planId`, `status` | FR-038 |
| `topics.reordered` | USER | CLASS_PLAN | `topicCount`, `movedCount` | FR-035 |
| `class_plan.syllabus_selected` | USER | CLASS_PLAN | `classId`, `revisionId`, `previousRevisionId`, `outsideRevisionLinks` | FR-031, FR-042 |
| `class_plan.status_changed` | USER | CLASS_PLAN | `classId`, `from`, `to`, `activatedTopics` | FR-031, FR-039 |

Um `topic.merged` é gravado para o tópico que fica; os tópicos juntados não ganham
`topic.archived` separado (a junção é um único registro, SC-010). O mesmo vale para
`MERGE` e `ARCHIVE` resolvidos na gravação do calendário: um `class_meetings.updated` e um
registro por tópico afetado.

## Não auditado (só log estruturado, FR-048)

Envio recusado (`syllabus.upload_rejected`: `code`, `declaredType`, `sizeBytes`; sem nome
de arquivo), tentativa de processamento com falha transitória
(`syllabus.processing_retry`: `documentId`, `attempt`, `category`), prazo esgotado no
worker thread (`syllabus.worker_timeout`), checksum divergente no download
(`syllabus.checksum_mismatch`, nível `error`), conflitos de revisão
(`class_plan.revision_conflict`) e recusas de autorização (já registradas pela Fase 001).
