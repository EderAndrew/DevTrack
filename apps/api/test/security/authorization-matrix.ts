import type { RoleKey } from "@repo/contracts";
import type { PermissionKey } from "../../src/modules/access-control/permissions";

/**
 * Transcribed by hand from contracts/permissions.md of specs 001, 003, 004, 006 and 010 (not derived from the seed), so a drift
 * between the contract and the database breaks the tests.
 */

export type Access = "session" | PermissionKey;

export interface MatrixEntry {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Route pattern as registered (without the `/api` prefix). */
  path: string;
  access: Access;
  /** `multipart/form-data` route (004): the matrix sends a small file instead of a JSON body. */
  upload?: true;
}

const PROFESSORES = [
  "professores.visualizar",
  "professores.convidar",
  "professores.reenviar_convite",
  "professores.revogar_convite",
  "professores.suspender",
  "professores.desativar",
  "professores.ativar",
] as const satisfies PermissionKey[];

const MANAGERS = [
  "managers.visualizar",
  "managers.convidar",
  "managers.reenviar_convite",
  "managers.revogar_convite",
  "managers.desativar",
  "managers.ativar",
] as const satisfies PermissionKey[];

const SESSOES = ["sessoes.proprias.listar", "sessoes.proprias.revogar"] as const satisfies PermissionKey[];

/** 003: the teacher's class permissions (MANAGER and ADMIN get none). */
const TURMAS = [
  "turmas.criar",
  "turmas.visualizar",
  "turmas.editar",
  "turmas.alterar_situacao",
  "turmas.convidar_aluno",
  "turmas.reenviar_convite",
  "turmas.cancelar_convite",
  "turmas.visualizar_alunos",
  "turmas.remover_aluno",
] as const satisfies PermissionKey[];

/** 004: subjects, syllabus, calendar and class plan — TEACHER only (MANAGER and ADMIN get none). */
export const CURRICULUM = [
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
] as const satisfies PermissionKey[];

/** 006: the teacher's own AI executions and proposals. */
export const AI_TEACHER = ["ia.execucoes.visualizar", "ia.propostas.revisar"] as const satisfies PermissionKey[];

/** 006: AI operations — ADMIN only, never pedagogical content. */
export const AI_OPERATIONS = ["ia.operacao.visualizar", "ia.agentes.gerenciar"] as const satisfies PermissionKey[];

/** 010: the teacher's private exercise bank and its AI generation (MANAGER and ADMIN get none). */
export const EXERCISE_BANK = [
  "questoes.visualizar",
  "questoes.criar",
  "questoes.editar",
  "questoes.aprovar",
  "ia.exercicios.gerar",
] as const satisfies PermissionKey[];

/** 011: the teacher's private work bank and its AI generation (MANAGER and ADMIN get none). */
export const WORK_BANK = [
  "trabalhos.visualizar",
  "trabalhos.criar",
  "trabalhos.editar",
  "trabalhos.arquivar",
  "trabalhos.aprovar",
  "ia.trabalhos.gerar",
] as const satisfies PermissionKey[];

/** 012: class activities — the teacher applies, receives, grades and releases (MANAGER and ADMIN get none). */
export const CLASS_ACTIVITIES = [
  "atividades.visualizar",
  "atividades.aplicar",
  "entregas.visualizar",
  "notas.lancar",
  "notas.liberar",
] as const satisfies PermissionKey[];

/** 012: the student portal — the student's own activities, answers and released results. */
export const STUDENT_PORTAL = [
  "atividades.proprias.visualizar",
  "atividades.proprias.responder",
  "notas.proprias.visualizar",
] as const satisfies PermissionKey[];

/** 013: the teacher marks practice answers and sees the class ranking. */
export const EXERCISE_POINTS_TEACHER = ["exercicios.corrigir", "ranking.visualizar"] as const satisfies PermissionKey[];

/** 013: the student sees the ranking of their classes. */
export const EXERCISE_POINTS_STUDENT = ["ranking.turma.visualizar"] as const satisfies PermissionKey[];

/** 015: the student asks for and reads the AI help of a work. */
export const WORK_HELP_STUDENT = ["ia.ajuda.pedir"] as const satisfies PermissionKey[];

/** "Papéis → permissões" of the contract. */
export const ROLE_PERMISSIONS: Record<RoleKey, readonly PermissionKey[]> = {
  ADMIN: [
    ...SESSOES,
    ...PROFESSORES,
    ...MANAGERS,
    "usuarios.visualizar",
    "usuarios.suspender",
    "usuarios.reativar",
    ...AI_OPERATIONS,
  ],
  MANAGER: [...SESSOES, ...PROFESSORES],
  TEACHER: [...SESSOES, ...TURMAS, ...CURRICULUM, ...AI_TEACHER, ...EXERCISE_BANK, ...WORK_BANK, ...CLASS_ACTIVITIES, ...EXERCISE_POINTS_TEACHER],
  STUDENT: [...SESSOES, "turmas.proprias.listar", ...STUDENT_PORTAL, ...EXERCISE_POINTS_STUDENT, ...WORK_HELP_STUDENT],
};

/** Every non-public route and what it requires ("Matriz de autorização esperada"). */
export const MATRIX: readonly MatrixEntry[] = [
  { method: "GET", path: "/me", access: "session" },
  { method: "POST", path: "/auth/logout", access: "session" },
  { method: "POST", path: "/auth/logout-all", access: "session" },

  { method: "GET", path: "/me/sessions", access: "sessoes.proprias.listar" },
  { method: "GET", path: "/me/sessions/:id", access: "sessoes.proprias.listar" },
  { method: "DELETE", path: "/me/sessions/:id", access: "sessoes.proprias.revogar" },

  { method: "GET", path: "/teachers", access: "professores.visualizar" },
  { method: "GET", path: "/teachers/:userId", access: "professores.visualizar" },
  { method: "POST", path: "/teachers/:userId/suspend", access: "professores.suspender" },
  { method: "POST", path: "/teachers/:userId/deactivate", access: "professores.desativar" },
  { method: "POST", path: "/teachers/:userId/reactivate", access: "professores.ativar" },
  { method: "GET", path: "/teacher-invitations", access: "professores.visualizar" },
  { method: "POST", path: "/teacher-invitations", access: "professores.convidar" },
  { method: "POST", path: "/teacher-invitations/:id/resend", access: "professores.reenviar_convite" },
  { method: "POST", path: "/teacher-invitations/:id/revoke", access: "professores.revogar_convite" },

  { method: "GET", path: "/managers", access: "managers.visualizar" },
  { method: "POST", path: "/managers/:userId/deactivate", access: "managers.desativar" },
  { method: "POST", path: "/managers/:userId/reactivate", access: "managers.ativar" },
  { method: "GET", path: "/manager-invitations", access: "managers.visualizar" },
  { method: "POST", path: "/manager-invitations", access: "managers.convidar" },
  { method: "POST", path: "/manager-invitations/:id/resend", access: "managers.reenviar_convite" },
  { method: "POST", path: "/manager-invitations/:id/revoke", access: "managers.revogar_convite" },

  { method: "GET", path: "/users", access: "usuarios.visualizar" },
  { method: "GET", path: "/users/:id", access: "usuarios.visualizar" },
  { method: "POST", path: "/users/:id/suspend", access: "usuarios.suspender" },
  { method: "POST", path: "/users/:id/reactivate", access: "usuarios.reativar" },

  { method: "GET", path: "/classes", access: "turmas.visualizar" },
  { method: "POST", path: "/classes", access: "turmas.criar" },
  { method: "GET", path: "/classes/:id", access: "turmas.visualizar" },
  { method: "PATCH", path: "/classes/:id", access: "turmas.editar" },
  { method: "POST", path: "/classes/:id/status", access: "turmas.alterar_situacao" },
  { method: "GET", path: "/classes/:id/invitations", access: "turmas.visualizar" },
  { method: "POST", path: "/classes/:id/invitations", access: "turmas.convidar_aluno" },
  { method: "POST", path: "/classes/:id/invitations/:invitationId/resend", access: "turmas.reenviar_convite" },
  { method: "POST", path: "/classes/:id/invitations/:invitationId/cancel", access: "turmas.cancelar_convite" },
  { method: "GET", path: "/classes/:id/enrollments", access: "turmas.visualizar_alunos" },
  { method: "POST", path: "/classes/:id/enrollments/:enrollmentId/remove", access: "turmas.remover_aluno" },
  { method: "GET", path: "/me/classes", access: "turmas.proprias.listar" },

  { method: "GET", path: "/subjects", access: "disciplinas.visualizar" },
  { method: "POST", path: "/subjects", access: "disciplinas.criar" },
  { method: "GET", path: "/subjects/:id", access: "disciplinas.visualizar" },
  { method: "PATCH", path: "/subjects/:id", access: "disciplinas.editar" },
  { method: "POST", path: "/subjects/:id/status", access: "disciplinas.editar" },

  { method: "GET", path: "/subjects/:id/syllabus-documents", access: "ementas.visualizar" },
  { method: "POST", path: "/subjects/:id/syllabus-documents", access: "ementas.enviar", upload: true },
  { method: "GET", path: "/syllabus-documents/:id", access: "ementas.visualizar" },
  { method: "GET", path: "/syllabus-documents/:id/file", access: "ementas.visualizar" },
  { method: "POST", path: "/syllabus-documents/:id/retry", access: "ementas.enviar" },
  { method: "POST", path: "/syllabus-documents/:id/revisions", access: "ementas.revisar" },
  { method: "GET", path: "/syllabus-revisions/:id", access: "ementas.visualizar" },
  { method: "PUT", path: "/syllabus-revisions/:id", access: "ementas.revisar" },
  { method: "POST", path: "/syllabus-revisions/:id/confirm", access: "ementas.revisar" },

  { method: "GET", path: "/classes/:id/meetings", access: "planejamento.visualizar" },
  { method: "PUT", path: "/classes/:id/meetings", access: "calendario.gerenciar" },

  { method: "GET", path: "/classes/:id/plan", access: "planejamento.visualizar" },
  { method: "PUT", path: "/classes/:id/plan/syllabus", access: "planejamento.editar" },
  { method: "POST", path: "/classes/:id/plan/status", access: "planejamento.alterar_situacao" },
  { method: "GET", path: "/classes/:id/plan/coverage", access: "planejamento.visualizar" },
  { method: "POST", path: "/classes/:id/plan/topics", access: "planejamento.editar" },
  { method: "GET", path: "/classes/:id/plan/topics", access: "planejamento.visualizar" },
  { method: "PATCH", path: "/classes/:id/plan/topics/:topicId", access: "planejamento.editar" },
  { method: "POST", path: "/classes/:id/plan/topics/merge", access: "planejamento.editar" },
  { method: "POST", path: "/classes/:id/plan/topics/:topicId/split", access: "planejamento.editar" },
  { method: "POST", path: "/classes/:id/plan/topics/:topicId/archive", access: "planejamento.editar" },
  { method: "POST", path: "/classes/:id/plan/topics/:topicId/restore", access: "planejamento.editar" },
  { method: "POST", path: "/classes/:id/plan/topics/:topicId/complete", access: "planejamento.editar" },
  { method: "POST", path: "/classes/:id/plan/topics/:topicId/reopen", access: "planejamento.editar" },
  { method: "PUT", path: "/classes/:id/plan/topic-order", access: "planejamento.editar" },

  // 006 — AI executions of the session teacher (the agent's own permission is checked in the service).
  { method: "POST", path: "/ai/executions", access: "ia.execucoes.visualizar" },
  { method: "GET", path: "/ai/executions", access: "ia.execucoes.visualizar" },
  { method: "GET", path: "/ai/executions/:id", access: "ia.execucoes.visualizar" },
  { method: "GET", path: "/ai/executions/:id/result", access: "ia.execucoes.visualizar" },
  { method: "POST", path: "/ai/executions/:id/cancel", access: "ia.execucoes.visualizar" },
  // 006 — proposals of L2 agents, reviewed by the session teacher.
  { method: "GET", path: "/ai/proposals", access: "ia.propostas.revisar" },
  { method: "GET", path: "/ai/proposals/:id", access: "ia.propostas.revisar" },
  { method: "POST", path: "/ai/proposals/:id/decision", access: "ia.propostas.revisar" },
  // 006 — AI operations of the administrator (never pedagogical content).
  { method: "GET", path: "/ai/operations/health", access: "ia.operacao.visualizar" },
  { method: "GET", path: "/ai/operations/metrics", access: "ia.operacao.visualizar" },
  { method: "GET", path: "/ai/operations/agents", access: "ia.operacao.visualizar" },
  { method: "GET", path: "/ai/operations/model-configs", access: "ia.operacao.visualizar" },
  { method: "POST", path: "/ai/operations/agents/:key/status", access: "ia.agentes.gerenciar" },
  { method: "POST", path: "/ai/operations/model-configs/:key/status", access: "ia.agentes.gerenciar" },
  // 009 — the model catalog and the task policies (aggregates and configuration only).
  { method: "GET", path: "/ai/operations/models", access: "ia.operacao.visualizar" },
  { method: "GET", path: "/ai/operations/tasks", access: "ia.operacao.visualizar" },
  // 009 — the administrator's override of a task's model (US7).
  { method: "PUT", path: "/ai/operations/tasks/:key/override", access: "ia.agentes.gerenciar" },
  { method: "DELETE", path: "/ai/operations/tasks/:key/override", access: "ia.agentes.gerenciar" },

  // 007 — "Preencher com IA" (contracts/permissions.md). The status and the request also require
  // ia.execucoes.visualizar, and the application ia.propostas.revisar, which every role holding
  // the ementas.* permissions has (TEACHER).
  { method: "GET", path: "/syllabus-documents/:id/ai", access: "ementas.visualizar" },
  { method: "POST", path: "/syllabus-documents/:id/ai-analyses", access: "ementas.revisar" },
  { method: "POST", path: "/syllabus-documents/:id/ai-proposals/:proposalId/apply", access: "ementas.revisar" },

  // 010 — the teacher's exercise bank (contracts/permissions.md).
  { method: "POST", path: "/exercises/sets", access: "questoes.criar" },
  { method: "POST", path: "/exercises", access: "questoes.criar" },
  { method: "GET", path: "/exercises", access: "questoes.visualizar" },
  { method: "GET", path: "/exercises/:id", access: "questoes.visualizar" },
  { method: "PUT", path: "/exercises/:id", access: "questoes.editar" },
  { method: "POST", path: "/exercises/:id/approve", access: "questoes.aprovar" },
  { method: "POST", path: "/exercises/:id/archive", access: "questoes.editar" },
  { method: "POST", path: "/exercises/:id/restore", access: "questoes.editar" },
  { method: "DELETE", path: "/exercises/:id", access: "questoes.editar" },
  { method: "GET", path: "/programming-languages", access: "questoes.visualizar" },
  // 010 — "Criar com IA" (the request and the availability also need ia.execucoes.visualizar).
  { method: "GET", path: "/exercise-generation/availability", access: "ia.exercicios.gerar" },
  { method: "POST", path: "/exercise-batches", access: "ia.exercicios.gerar" },
  { method: "GET", path: "/exercise-batches", access: "questoes.visualizar" },
  { method: "GET", path: "/exercise-batches/:id", access: "questoes.visualizar" },
  { method: "POST", path: "/exercise-batches/:id/approve", access: "questoes.aprovar" },

  // 011 — the teacher's work bank (contracts/permissions.md).
  { method: "POST", path: "/works", access: "trabalhos.criar" },
  { method: "GET", path: "/works", access: "trabalhos.visualizar" },
  { method: "GET", path: "/works/programming-languages", access: "trabalhos.visualizar" },
  { method: "GET", path: "/works/:id", access: "trabalhos.visualizar" },
  { method: "GET", path: "/works/:id/student-preview", access: "trabalhos.visualizar" },
  { method: "PUT", path: "/works/:id", access: "trabalhos.editar" },
  { method: "POST", path: "/works/:id/approve", access: "trabalhos.aprovar" },
  { method: "POST", path: "/works/:id/archive", access: "trabalhos.arquivar" },
  { method: "POST", path: "/works/:id/restore", access: "trabalhos.arquivar" },
  // 011 — "Criar trabalho com IA" (the request and the availability also need ia.execucoes.visualizar).
  { method: "GET", path: "/work-generation/availability", access: "ia.trabalhos.gerar" },
  { method: "POST", path: "/work-generation-requests", access: "ia.trabalhos.gerar" },
  { method: "GET", path: "/work-generation-requests", access: "trabalhos.visualizar" },
  { method: "GET", path: "/work-generation-requests/:id", access: "trabalhos.visualizar" },

  // 012 — class activities, the teacher's side (contracts/permissions.md).
  { method: "GET", path: "/classes/:classId/activities", access: "atividades.visualizar" },
  { method: "POST", path: "/classes/:classId/activities/scope-check", access: "atividades.aplicar" },
  { method: "POST", path: "/classes/:classId/activities", access: "atividades.aplicar" },
  { method: "GET", path: "/classes/:classId/activities/:activityId", access: "atividades.visualizar" },
  { method: "PATCH", path: "/classes/:classId/activities/:activityId", access: "atividades.aplicar" },
  { method: "POST", path: "/classes/:classId/activities/:activityId/close", access: "atividades.aplicar" },
  { method: "POST", path: "/classes/:classId/activities/:activityId/cancel", access: "atividades.aplicar" },
  { method: "POST", path: "/classes/:classId/activities/:activityId/release", access: "notas.liberar" },
  { method: "GET", path: "/classes/:classId/activities/:activityId/attempts/:attemptId", access: "entregas.visualizar" },
  { method: "PUT", path: "/classes/:classId/activities/:activityId/attempts/:attemptId/grades", access: "notas.lancar" },
  { method: "POST", path: "/classes/:classId/activities/:activityId/attempts/:attemptId/accept-submission", access: "notas.lancar" },
  // 013 — the teacher marks open answers and code right or wrong (contracts/permissions.md).
  { method: "PUT", path: "/classes/:classId/activities/:activityId/attempts/:attemptId/marks", access: "exercicios.corrigir" },
  // 012 — the student portal (contracts/permissions.md).
  { method: "GET", path: "/me/dashboard", access: "atividades.proprias.visualizar" },
  { method: "GET", path: "/me/activities", access: "atividades.proprias.visualizar" },
  { method: "GET", path: "/me/activities/:activityId", access: "atividades.proprias.visualizar" },
  { method: "POST", path: "/me/activities/:activityId/attempt", access: "atividades.proprias.responder" },
  { method: "PUT", path: "/me/activities/:activityId/attempt/answers", access: "atividades.proprias.responder" },
  { method: "POST", path: "/me/activities/:activityId/attempt/submit", access: "atividades.proprias.responder" },
  // 013 — practice attempts of an EXERCISE (contracts/permissions.md).
  { method: "POST", path: "/me/activities/:activityId/attempts", access: "atividades.proprias.responder" },
  { method: "POST", path: "/me/activities/:activityId/attempts/:number/complete", access: "atividades.proprias.responder" },
  { method: "GET", path: "/me/activities/:activityId/attempts/:number", access: "atividades.proprias.visualizar" },
  // 015 — the controlled mode's events of the own attempt (contracts/permissions.md).
  { method: "POST", path: "/me/activities/:activityId/attempt/events", access: "atividades.proprias.responder" },
  { method: "GET", path: "/me/activities/:activityId/attempt/integrity", access: "atividades.proprias.visualizar" },
  { method: "POST", path: "/me/activities/:activityId/attempt/help", access: "ia.ajuda.pedir" },
  { method: "GET", path: "/me/activities/:activityId/attempt/help", access: "ia.ajuda.pedir" },
  // 013 — the class ranking of practice points (contracts/permissions.md).
  { method: "GET", path: "/me/classes/:classId/ranking", access: "ranking.turma.visualizar" },
  { method: "GET", path: "/classes/:classId/ranking", access: "ranking.visualizar" },
  // 015 — the teacher's apply and edit forms ask whether the AI help can be turned on (contracts/permissions.md).
  { method: "GET", path: "/work-help/availability", access: "atividades.aplicar" },
  // 015/US4 — the controlled mode's records and the AI help of an attempt (contracts/permissions.md).
  { method: "GET", path: "/classes/:classId/activities/:activityId/integrity", access: "entregas.visualizar" },
  { method: "GET", path: "/classes/:classId/activities/:activityId/attempts/:attemptId/integrity", access: "entregas.visualizar" },
  { method: "GET", path: "/classes/:classId/activities/:activityId/attempts/:attemptId/help", access: "entregas.visualizar" },
];

export const routeKey = (entry: Pick<MatrixEntry, "method" | "path">) => `${entry.method} ${entry.path}`;

/** Concrete URL for an entry: random UUIDs, so an allowed call ends in 400/404 without side effects. */
export function concretePath(path: string): string {
  return `/api${path.replace(/:[A-Za-z]+/g, () => crypto.randomUUID())}`;
}
