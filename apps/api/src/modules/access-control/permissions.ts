import { RoleKeySchema } from "@repo/contracts";

/**
 * Permission and role keys seeded by migrations `seed_roles_permissions` (001),
 * `classes_invitations_enrollments` (003), `curriculum_planning` (004), `ai_foundation` (006), `exercise_bank` (010), the later features' own migrations and `student_feedback` (020) — contracts/permissions.md of each spec. Code checks permissions, never role names (Principle II);
 * role keys are used only to grant, change or count assignments.
 */
export const PERMISSIONS = [
  "professores.convidar",
  "professores.reenviar_convite",
  "professores.revogar_convite",
  "professores.visualizar",
  "professores.suspender",
  "professores.desativar",
  "professores.ativar",
  "managers.convidar",
  "managers.reenviar_convite",
  "managers.revogar_convite",
  "managers.visualizar",
  "managers.desativar",
  "managers.ativar",
  "usuarios.visualizar",
  "usuarios.suspender",
  "usuarios.reativar",
  "sessoes.proprias.listar",
  "sessoes.proprias.revogar",
  "turmas.criar",
  "turmas.visualizar",
  "turmas.editar",
  "turmas.alterar_situacao",
  "turmas.convidar_aluno",
  "turmas.reenviar_convite",
  "turmas.cancelar_convite",
  "turmas.visualizar_alunos",
  "turmas.remover_aluno",
  "turmas.proprias.listar",
  "disciplinas.visualizar",
  "disciplinas.criar",
  "disciplinas.editar",
  "ementas.enviar",
  "ementas.visualizar",
  "ementas.revisar",
  "calendario.gerenciar",
  "planejamento.visualizar",
  "planejamento.editar",
  "planejamento.alterar_situacao",
  "ia.execucoes.visualizar",
  "ia.propostas.revisar",
  "ia.operacao.visualizar",
  "ia.agentes.gerenciar",
  "questoes.visualizar",
  "questoes.criar",
  "questoes.editar",
  "questoes.aprovar",
  "ia.exercicios.gerar",
  "trabalhos.visualizar",
  "trabalhos.criar",
  "trabalhos.editar",
  "trabalhos.arquivar",
  "trabalhos.aprovar",
  "ia.trabalhos.gerar",
  "atividades.visualizar",
  "atividades.aplicar",
  "entregas.visualizar",
  "notas.lancar",
  "notas.liberar",
  "atividades.proprias.visualizar",
  "atividades.proprias.responder",
  "notas.proprias.visualizar",
  // 013 — exercise points and the class ranking (specs/013-exercise-points-ranking/contracts/permissions.md).
  "exercicios.corrigir",
  "ranking.visualizar",
  "ranking.turma.visualizar",
  // 015 — the AI help of a work (specs/015-controlled-work-ai-help/contracts/permissions.md).
  "ia.ajuda.pedir",
  // 016 — the attendance of a work and the room exits (specs/016-attendance-gated-release/contracts/permissions.md).
  "chamada.registrar",
  // 018 — the Banco de Provas, "Criar prova com IA" and the decisions on a hold (specs/018-controlled-exams/contracts/permissions.md).
  "provas.visualizar",
  "provas.criar",
  "provas.editar",
  "provas.aprovar",
  "provas.arquivar",
  "ia.provas.gerar",
  "provas.encerramentos.decidir",
  // 019 — the student runs code on an exercise's public cases (specs/019-exercise-code-runner/contracts/permissions.md).
  "atividades.proprias.executar",
  // 020 — student feedback to the platform ADMIN (specs/020-student-feedback/contracts/permissions.md).
  "feedbacks.enviar",
  "feedbacks.proprios.listar",
  "feedbacks.visualizar",
  "feedbacks.alterar_situacao",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

/** Seeded roles; the values and the `RoleKey` type come from the contract (002 T034). */
export const ROLE_KEYS = RoleKeySchema.options;
