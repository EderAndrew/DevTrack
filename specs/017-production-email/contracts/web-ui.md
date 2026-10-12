# Web UI: 017

## Invitations (class 003, teachers and managers 001)

The delivery situation is text plus a `Badge`, never colour alone:

| `delivery` | `deliveryIssue` | Text | Badge |
|---|---|---|---|
| `SENDING` | — | "Enviando" (003) | `neutral` |
| `SENT` | — | (nothing, as today) | — |
| `FAILED` | — | "Envio falhou" (003) | `danger` |
| `UNDELIVERED` | `BOUNCED`, `REJECTED` | badge "Não entregue" + text "O endereço não existe ou recusou a mensagem." | `warning` |
| `UNDELIVERED` | `COMPLAINED` | badge "Não entregue" + text "Marcado como spam pelo destinatário." | `warning` |

- Only on invitations still `PENDING`.
- "Reenviar" on an `UNDELIVERED` invitation opens an `AlertDialog` "Reenviar para o mesmo
  endereço?" with "Este endereço já recusou a mensagem. Confira o e-mail antes de reenviar." and
  "Reenviar" / "Voltar"; the other invitations keep the 003 behaviour.
- The teacher's tab (`features/classes/components/class-invitations-tab.tsx`) and the lists of
  `features/teachers` and `features/managers`.
- Account e-mails (confirmation, reset, admin activation) show no delivery situation anywhere.

## E-mails (not a web page)

Six templates with an HTML and a text body from one source (research N9): "DevTrack" header, title,
paragraphs, a button-styled link with the action, the same link written out, the expiry, the
footer "Você recebeu este e-mail porque … Se não esperava, ignore-o."; light-theme token colours
inline, no external resource.
