# Permissions (031)

Seeded by the 031 migration (`INSERT … ON CONFLICT DO NOTHING`), constitution XXV.

| Key | Description | Roles |
|-----|-------------|-------|
| `calendario.turma.visualizar` | Ver o calendário das disciplinas das próprias turmas | `STUDENT` |

Unchanged: `calendario.gerenciar` (TEACHER, mark days and kinds), `planejamento.visualizar` (TEACHER, read the own
calendar). MANAGER and ADMIN receive neither 031 capability; the MANAGER never reaches a class's calendar (027).

| Route | Permission | Context (else 404) |
|-------|------------|--------------------|
| `GET /classes/:id/meetings` | `planejamento.visualizar` | own class |
| `PUT /classes/:id/meetings` | `calendario.gerenciar` | own class, not archived |
| `GET /me/classes/:classId/calendar` | `calendario.turma.visualizar` | ACTIVE enrollment in the class's turma |
