# HTTP API: "Minhas turmas" do aluno redesenhada (030)

## `GET /me/classes` (changed: one field)

- Permission `turmas.proprias.listar`, session student only, as in 003/027. No query parameters (MT2); none accepted.
- Response `MyCohortListSchema` — unchanged except each turma gains `enrolledAt`:

```json
{
  "years": [
    {
      "academicYear": 2026,
      "cohorts": [
        {
          "id": "…",
          "name": "Turma de Teste",
          "code": "QA001",
          "period": "2026-2",
          "status": "ACTIVE",
          "enrolledAt": "2026-11-07T21:08:00.000Z",
          "classes": [
            { "classId": "…", "subjectName": "Object Oriented Programming", "teacherName": "Eder Andrew", "effectiveStatus": "ACTIVE" }
          ]
        }
      ]
    }
  ]
}
```

- `enrolledAt` is the `enrolled_at` of the student's own ACTIVE enrollment in that turma; never another student's, never
  of an ENDED enrollment (those turmas are absent, as today).
- Order unchanged: ano letivo desc, enrollment desc (then id), disciplinas by creation.
- Errors unchanged (`401`, `403` without the permission).

No audit event (read). No other route changes.
