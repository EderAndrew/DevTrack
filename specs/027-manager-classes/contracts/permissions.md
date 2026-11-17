# Permission matrix: Turmas do gestor e disciplinas da turma (027)

`✓` allowed; `403` without the capability; `404` with the capability but outside the context.

| Operation | ADMIN | MANAGER | TEACHER | STUDENT |
|---|---|---|---|---|
| List / view / create / edit cohort, change its status | ✓ | ✓ | 403 | 403 |
| Invite, resend, cancel invitation | ✓ | ✓ | 403 | 403 |
| List enrollments with e-mail, end an enrollment | ✓ | ✓ | 403 | 403 |
| Student lookup by exact e-mail, direct enrollment | ✓ | ✓ | 403 | 403 |
| Search active cohorts (minimal data) | 403 | 403 | ✓ | 403 |
| Create a disciplina da turma in an active cohort with an own active subject | 403 | 403 | ✓ | 403 |
| View / edit calendar / close / archive a disciplina da turma | 403 | 403 | own ✓, other's 404 | 403 |
| Read-only roster of a disciplina da turma | 403 | 403 | own ✓, other's 404 | 403 |
| Everything of 004–025 inside a class (plan, activities, attendance, exams, review, ranking) | 403 | 403 | own ✓, other's 404 (also in the same cohort) | as today, by enrollment in the cohort |
| "Minhas turmas" | — | — | — | own ✓ |

A person with several roles has the union. MANAGER/ADMIN never reach a class's pedagogical route (`403`, constitution
XXV). A teacher who is also a student of a cohort sees it as a student only.
