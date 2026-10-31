import type { AiErrorCode, CurriculumAiAvailability, CurriculumReviewWarningCode, ErrorCode } from "@repo/contracts";
import { ApiError, NETWORK_ERROR, UNEXPECTED_RESPONSE } from "../api/client";

type ClientErrorCode = typeof NETWORK_ERROR | typeof UNEXPECTED_RESPONSE;
/** Codes only an e-mail provider receives (017 `POST /mail/notices/:provider`); the web never shows them. */
type ProviderOnlyErrorCode = "NOTICE_REJECTED" | "NOTICE_TOO_LARGE";

/**
 * User-facing text for every error code: the contract's codes plus the web's own (002 S8, FR-013).
 * The texts belong to the web, not to the API's `message`; they are the Phase 001 texts (FR-012)
 * plus the codes added by 003 (specs/003-class-invitations-enrollment/contracts/web-ui.md) and
 * 004 (specs/004-syllabus-planning/contracts/web-ui.md) and 006 (specs/006-ai-foundation/contracts/web-ui.md).
 */
export const ERROR_MESSAGES = {
  VALIDATION_ERROR: "Dados inválidos.",
  WEAK_PASSWORD: "A senha deve ter entre 12 e 128 caracteres e não pode ser uma senha comum.",
  PASSWORD_REQUIRED: "Defina uma senha para continuar.",
  TOKEN_INVALID: "Link inválido ou expirado.",
  TOKEN_EXPIRED: "Este convite expirou.",
  RA_REQUIRED: "Informe o RA.",
  FILE_TYPE_NOT_ALLOWED: "Envie um arquivo PDF, DOCX, PNG ou JPG.",
  FILE_UNREADABLE: "Não foi possível abrir este arquivo.",
  FILE_PROTECTED: "Este arquivo está protegido por senha.",
  FILE_MACROS: "Arquivos com macros não são aceitos.",
  FILE_TOO_COMPLEX: "O arquivo tem páginas ou conteúdo demais para processar.",
  UNAUTHENTICATED: "Autenticação necessária.",
  INVALID_CREDENTIALS: "E-mail ou senha incorretos.",
  SIGN_IN_REQUIRED: "Entre na sua conta para continuar.",
  FORBIDDEN: "Você não possui permissão para esta operação.",
  EMAIL_NOT_VERIFIED: "Verifique seu e-mail para continuar.",
  ACCOUNT_SUSPENDED: "Esta conta está suspensa.",
  WRONG_ACCOUNT: "Você está conectado em outra conta. Entre com a conta do e-mail convidado.",
  SELF_INVITE_FORBIDDEN: "Não é possível convidar a si mesmo.",
  SELF_ACTION_FORBIDDEN: "Não é possível executar esta operação sobre a própria conta.",
  ORIGIN_NOT_ALLOWED: "Origem da requisição não permitida.",
  NOT_FOUND: "Recurso não encontrado.",
  INVALID_STATE_TRANSITION: "Operação não permitida no estado atual.",
  ALREADY_TEACHER: "Esta pessoa já é professor.",
  ALREADY_MANAGER: "Esta pessoa já é gestor de cadastros.",
  TEACHER_REACTIVATION_REQUIRED: "O papel de professor desta pessoa está suspenso ou inativo. Use a reativação.",
  INVITATION_ALREADY_PENDING: "Já existe um convite pendente para este e-mail. Reenvie o convite existente.",
  LAST_ADMIN_PROTECTED: "Não é possível remover o último administrador ativo.",
  BOOTSTRAP_ALREADY_DONE: "Bootstrap administrativo já realizado.",
  CLASS_CODE_TAKEN: "Você já tem uma turma com este código.",
  CLASS_NOT_OPEN: "Esta turma não aceita novos alunos.",
  ALREADY_ENROLLED: "Este aluno já está matriculado nesta turma.",
  RA_TAKEN: "Este RA já está em uso.",
  SUBJECT_NAME_TAKEN: "Você já tem uma disciplina com este nome.",
  SUBJECT_INACTIVE: "Esta disciplina está desativada. Reative-a para usá-la.",
  CLASS_SUBJECT_LOCKED: "A disciplina da turma não pode mais ser trocada: o planejamento já usa a ementa dela.",
  MEETINGS_OUTSIDE_PERIOD: "Há aulas marcadas fora das novas datas. Desmarque-as no calendário antes de mudar o período.",
  REVISION_DRAFT_EXISTS: "Já existe uma revisão em andamento para esta versão da ementa.",
  REVISION_CONFIRMED: "Este conteúdo já foi confirmado e não pode ser alterado.",
  MEETING_HAS_TOPICS: "Esta aula tem tópicos planejados. Escolha o que fazer com eles antes de desmarcá-la.",
  PLAN_REVISION_CONFLICT: "O planejamento foi alterado depois que você o abriu. Atualize a página antes de continuar.",
  PLAN_ARCHIVED: "Este planejamento está arquivado e não pode ser alterado.",
  FILE_TOO_LARGE: "O arquivo passa de 10 MB.",
  CLASS_NOT_PLANNABLE: "Informe a disciplina e as datas de início e término da turma para planejar.",
  EXTRACTION_UNAVAILABLE: "Não foi possível ler o texto deste arquivo. Preencha o conteúdo manualmente.",
  REVISION_EMPTY: "Inclua ao menos um item antes de confirmar.",
  REVISION_NOT_CONFIRMED: "Confirme o conteúdo da ementa antes de usá-lo.",
  MEETING_OUT_OF_PERIOD: "A data está fora do período da turma.",
  TOO_MANY_MEETINGS: "A turma pode ter no máximo 200 aulas.",
  SYLLABUS_REQUIRED: "Envie e confirme a ementa antes de criar tópicos.",
  SYLLABUS_ITEM_NOT_IN_PLAN: "Este item não existe na versão da ementa usada agora.",
  PLAN_HAS_NO_TOPICS: "Crie ao menos um tópico antes de confirmar.",
  TOO_MANY_TOPICS: "O planejamento pode ter no máximo 300 tópicos.",
  MEETING_NOT_HELD_YET: "Só é possível concluir uma aula a partir da data dela.",
  AI_AGENT_NOT_FOUND: "Este recurso de IA não está disponível.",
  AI_AGENT_DISABLED: "Este recurso de IA está desativado no momento.",
  AI_MODEL_UNAVAILABLE: "A IA está indisponível no momento. Tente de novo mais tarde.",
  AI_EXECUTION_LIMIT_EXCEEDED: "O conteúdo enviado para a IA é grande demais.",
  AI_IDEMPOTENCY_KEY_REUSED: "Este pedido já foi feito com outros dados. Recarregue a página e tente de novo.",
  AI_PROPOSAL_ITEMS_INVALID: "Selecione ao menos um item, sem selecionar todos, para aprovar em parte.",
  AI_RESOURCE_TYPE_NOT_ACCEPTED: "Este recurso de IA não pode ser usado aqui.",
  AI_PROPOSAL_APPLY_REQUIRED: "Esta proposta é aprovada ao aplicá-la na ementa.",
  AI_OVERRIDE_NOT_ALLOWED: "Este modelo não pode ser fixado para esta tarefa.",
  EXERCISE_VERSION_CONFLICT: "Este exercício foi alterado depois que você o abriu. Atualize a página antes de continuar.",
  WORK_VERSION_CONFLICT: "Este trabalho mudou em outra aba. Recarregue para ver a versão atual.",
  SUBJECT_ARCHIVED: "Esta disciplina está arquivada e não pode ser usada para gerar exercícios.",
  SYLLABUS_LANGUAGE_REQUIRED: "Defina a linguagem da ementa para gerar exercícios de código.",
  SYLLABUS_NOT_READY_FOR_AI:
    "O preenchimento com IA precisa de um documento com texto (PDF com texto ou DOCX). Preencha o conteúdo manualmente.",
  CURRICULUM_PROPOSAL_PENDING:
    "Já existe uma proposta aguardando revisão. Revise-a ou descarte-a para pedir uma nova análise.",
  CURRICULUM_SOURCE_CHANGED: "O documento analisado não corresponde mais a esta proposta. Peça uma nova análise.",
  CURRICULUM_PROPOSAL_INVALID:
    "Parte do conteúdo selecionado não pode ser aplicada. Desmarque o campo indicado e tente de novo.",
  SUBJECT_MISMATCH: "Este item do banco é de outra disciplina. Aplique-o numa turma da mesma disciplina.",
  OUT_OF_SCOPE_NOT_ACKNOWLEDGED: "Confirme a aplicação com tópicos ainda não concluídos no planejamento desta turma.",
  SOURCE_NOT_APPROVED: "Só itens aprovados do seu banco podem ser aplicados a uma turma.",
  INVALID_SCHEDULE: "O prazo deve ser depois da data de publicação.",
  ALREADY_PUBLISHED: "A data de publicação não pode mudar depois que a atividade foi publicada.",
  CLASS_NOT_ACTIVE: "Esta turma não está ativa.",
  ACTIVITY_VERSION_CONFLICT: "Esta atividade mudou em outra aba. Recarregue para ver a versão atual.",
  SUBMISSION_VERSION_CONFLICT: "Esta correção mudou em outra aba. Recarregue para ver a versão atual.",
  NOT_SUBMITTED: "Este aluno ainda não entregou a atividade.",
  GRADE_OUT_OF_RANGE: "A nota da questão deve ficar entre 0 e o valor dela.",
  UNKNOWN_QUESTION: "Esta questão não pertence à atividade.",
  NOT_STARTED: "Inicie a atividade antes de responder.",
  ATTEMPT_ALREADY_SUBMITTED: "Esta atividade já foi entregue.",
  ANSWER_CHANGED_ELSEWHERE: "Uma resposta foi alterada em outra aba. Carregamos a versão mais recente; revise antes de entregar.",
  DEADLINE_PASSED: "O prazo desta atividade terminou e ela não aceita entrega atrasada. Suas respostas salvas continuam guardadas.",
  ACTIVITY_CLOSED: "Esta atividade foi encerrada pelo professor.",
  INVALID_ANSWER: "Esta resposta não é válida para a questão.",
  STUDENT_CAN_STILL_SUBMIT: "Este aluno ainda pode entregar a atividade.",
  ATTEMPT_NOT_COMPLETED: "Conclua a tentativa atual antes de refazer.",
  NOT_LATEST_ATTEMPT: "Esta tentativa já foi refeita. Carregamos a mais recente.",
  NOT_MARKABLE: "Esta resposta não precisa de correção do professor.",
  AI_HELP_UNAVAILABLE: "A ajuda está indisponível agora; tente de novo em instantes.",
  ACTIVITY_ALREADY_STARTED: "Não é possível mudar depois que um aluno iniciou.",
  NOT_CONTROLLED: "Esta atividade não está em modo controlado.",
  HELP_PENDING: "Aguarde a orientação anterior.",
  HELP_EXHAUSTED: "Você já usou as 3 ajudas deste trabalho.",
  HELP_NOT_ENABLED: "Esta atividade não tem ajuda da IA.",
  TYPING_LIMIT_EXCEEDED: "Esse trecho não foi salvo porque parece ter sido colado. Digite a resposta.",
  ATTEMPT_PAUSED: "Atividade pausada. Peça ao professor para liberar o seu retorno.",
  ATTENDANCE_STARTED: "O aluno já iniciou. Use Pausar aluno.",
  ATTENDANCE_NOT_REQUIRED: "Esta atividade não usa lista de chamada.",
  STUDENT_NOT_IN_CLASS: "Um dos alunos não está matriculado nesta turma.",
  EXAM_RULES: "Revise as questões destacadas antes de salvar.",
  EXAM_VERSION_CONFLICT: "Esta prova mudou em outra aba. Recarregue para ver a versão atual.",
  EXAM_ARCHIVED: "Esta prova está arquivada.",
  EXAM_NOT_APPROVED: "Só uma prova aprovada pode ser aplicada.",
  EXAM_START_CLOSED: "O prazo para iniciar esta prova terminou. Fale com o professor.",
  EXAM_TIME_OVER: "Tempo esgotado. Suas respostas salvas foram registradas.",
  EXAM_ATTEMPT_ON_HOLD: "Prova encerrada por excesso de avisos; o cancelamento com nota zero será confirmado pelo professor",
  EXAM_TIME_NOT_OVER: "Ainda há tempo de prova: devolva a prova ou confirme o cancelamento.",
  EXAM_DECISIONS_PENDING: "Há provas encerradas por avisos aguardando a sua decisão.",
  EXIT_NOT_ALLOWED: "Na prova, chame o professor para sair da sala.",
  NOT_AN_EXAM: "Esta atividade não é uma prova.",
  CODE_RUN_NOT_AVAILABLE: "Este exercício não tem casos para executar.",
  CODE_RUNNER_UNAVAILABLE: "Execução indisponível no momento. Você pode continuar respondendo e concluir normalmente.",
  CODE_EXECUTION_NOT_ELIGIBLE: "Este trabalho não tem questão de Código com caso público numa linguagem com execução.",
  // 023/FR-002: "Em grupo" on a work applied without attendance.
  GROUP_NEEDS_ATTENDANCE: "Este trabalho foi aplicado sem chamada e só pode ser individual.",
  GROUP_MEMBERS_UNAVAILABLE: "Algum colega escolhido não está mais disponível. Revise a lista.",
  GROUP_FULL: "O grupo já tem o máximo de integrantes deste trabalho.",
  GROUP_ALREADY_JOINED: "Você já participa de um grupo que está fazendo este trabalho.",
  GROUP_NOT_EDITOR: "Outro integrante está editando agora. Suas respostas não foram salvas.",
  GROUP_NOT_LEADER: "Só o líder do grupo pode fazer isso.",
  GROUP_MEMBER_NOT_AVAILABLE: "Este integrante não pode receber a edição agora.",
  SOURCE_TOO_LARGE: "O código passou do tamanho máximo de 64 KB.",
  ATTEMPT_NOT_IN_PROGRESS: "Comece ou refaça os exercícios para executar o código.",
  EXERCISE_RULES: "Revise os campos destacados do exercício antes de salvar.",
  RATE_LIMITED: "Muitas tentativas. Tente novamente mais tarde.",
  INTERNAL_ERROR: "Erro interno. Tente novamente mais tarde.",
  [NETWORK_ERROR]: "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
  [UNEXPECTED_RESPONSE]: "Erro inesperado. Tente novamente mais tarde.",
} as const satisfies Record<Exclude<ErrorCode, ProviderOnlyErrorCode> | ClientErrorCode, string>;

const isKnownCode = (code: string): code is keyof typeof ERROR_MESSAGES => Object.hasOwn(ERROR_MESSAGES, code);

/**
 * Text to show for any failure: the catalogue entry for the error's code, never the API's
 * `message`. `RATE_LIMITED` with `Retry-After` says how many minutes to wait; an unknown code
 * (an API newer than this web) or a non-API error gets the generic text.
 */
export function messageForError(error: unknown): string {
  if (!(error instanceof ApiError)) return ERROR_MESSAGES[UNEXPECTED_RESPONSE];
  if (error.code === "RATE_LIMITED" && error.retryAfterSeconds) {
    const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
    return `Muitas tentativas. Tente novamente em ${minutes} minuto${minutes > 1 ? "s" : ""}.`;
  }
  return isKnownCode(error.code) ? ERROR_MESSAGES[error.code] : ERROR_MESSAGES[UNEXPECTED_RESPONSE];
}

/**
 * Code of an API answer (`WEAK_PASSWORD`, `TOKEN_INVALID`…), for screens that point an error at a
 * field or change step; undefined for anything that is not an `ApiError`. Components use this
 * instead of importing `lib/api` (FR-025).
 */
export function apiErrorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined;
}

/**
 * What happened and what the teacher can do, for each normalized code of a failed AI execution
 * (006/FR-066, contracts/web-ui.md). Never mentions the provider or the model.
 */
export const AI_ERROR_GUIDANCE = {
  AI_AGENT_NOT_FOUND: {
    title: "Este recurso de IA não está disponível.",
    guidance: "Ele pode ter sido retirado. Continue sem a IA ou fale com a administração.",
  },
  AI_AGENT_DISABLED: {
    title: "Este recurso de IA foi desativado.",
    guidance: "Tente de novo mais tarde ou continue sem a IA.",
  },
  AI_MODEL_UNAVAILABLE: {
    title: "A IA está indisponível no momento.",
    guidance: "Tente de novo mais tarde.",
  },
  AI_PROVIDER_ERROR: {
    title: "A IA não conseguiu responder.",
    guidance: "Tente de novo em alguns minutos.",
  },
  AI_TIMEOUT: {
    title: "A IA demorou demais para responder.",
    guidance: "Tente de novo em alguns minutos.",
  },
  AI_RATE_LIMITED: {
    title: "A IA está recebendo muitos pedidos agora.",
    guidance: "Espere alguns minutos e tente de novo.",
  },
  AI_TOOL_NOT_ALLOWED: {
    title: "A IA tentou uma consulta que não é permitida.",
    guidance: "Nada foi alterado. Tente de novo; se continuar, fale com a administração.",
  },
  AI_TOOL_EXECUTION_FAILED: {
    title: "A IA não conseguiu consultar os dados de que precisava.",
    guidance: "Tente de novo em alguns minutos.",
  },
  AI_OUTPUT_PARSE_FAILED: {
    title: "A resposta da IA veio em um formato inválido.",
    guidance: "Nada foi salvo. Tente de novo.",
  },
  AI_OUTPUT_VALIDATION_FAILED: {
    title: "A resposta da IA não pôde ser aproveitada.",
    guidance: "Nada foi salvo. Tente de novo.",
  },
  AI_CONTEXT_ACCESS_DENIED: {
    title: "A IA não pôde acessar este conteúdo.",
    guidance: "Confira se ele ainda existe e se você ainda tem acesso a ele.",
  },
  AI_EXECUTION_CANCELLED: {
    title: "O pedido à IA foi cancelado.",
    guidance: "Faça um novo pedido quando quiser.",
  },
  AI_EXECUTION_LIMIT_EXCEEDED: {
    title: "O pedido passou do limite da IA.",
    guidance: "Tente com um conteúdo menor.",
  },
} as const satisfies Record<AiErrorCode, { title: string; guidance: string }>;

const AI_UNAVAILABLE = "O preenchimento com IA está indisponível no momento.";

/**
 * Why "Preencher com IA" can't be used on a document (007 contracts/http-api.md, web-only
 * messages): never the provider or the model.
 */
export const CURRICULUM_AI_AVAILABILITY_MESSAGES = {
  DOCUMENT_NOT_READY: "Aguarde o processamento do documento para usar a IA.",
  DOCUMENT_WITHOUT_TEXT: ERROR_MESSAGES.SYLLABUS_NOT_READY_FOR_AI,
  AGENT_DISABLED: AI_UNAVAILABLE,
  MODEL_UNAVAILABLE: AI_UNAVAILABLE,
  PAUSED: AI_UNAVAILABLE,
} as const satisfies Record<Exclude<CurriculumAiAvailability, "AVAILABLE">, string>;

/** Why "Criar com IA" can't take a request now (010/US2-7): never the provider or the model. */
export const EXERCISE_AI_UNAVAILABLE = "A geração com IA está indisponível no momento. Você pode criar exercícios manualmente.";

/** Why "Criar trabalho com IA" can't take a request now (011/US3-8): never the provider or the model. */
export const WORK_AI_UNAVAILABLE = "A geração com IA está indisponível no momento. Você pode criar o trabalho manualmente.";

/** Why "Criar prova com IA" can't take a request now (018/US7-3, contracts/web-ui.md): never the provider or the model. */
export const EXAM_AI_UNAVAILABLE = "A geração com IA não está disponível. Crie a prova manualmente.";

/** The last analysis found nothing to propose (007/FR-017). */
export const CURRICULUM_AI_NOTHING_FOUND =
  "Não foi possível identificar conteúdo de ementa neste documento. Preencha manualmente.";

/** A `429` on "Preencher com IA" (007 contracts/web-ui.md). */
export const CURRICULUM_AI_RATE_LIMITED = "Muitas análises solicitadas. Tente novamente em alguns minutos.";

/**
 * What each warning of a curriculum proposal says next to its field, group or item (007
 * contracts/web-ui.md). The model reports codes only; its prose never reaches the screen.
 */
export const CURRICULUM_WARNING_MESSAGES = {
  UNSUPPORTED_CONTENT: "Não encontrado no documento — confira antes de aplicar.",
  FIELD_NOT_FOUND: "Não identificado no documento.",
  AMBIGUOUS_STRUCTURE: "A estrutura do documento é ambígua neste ponto.",
  LOW_DOCUMENT_QUALITY: "Parte do documento está com baixa qualidade.",
  INCOMPLETE_SECTION: "Esta seção parece incompleta no documento.",
  UNREADABLE_CONTENT: "Parte do conteúdo não pôde ser lida.",
  POSSIBLE_DUPLICATE_CONTENT: "Possível conteúdo repetido.",
} as const satisfies Record<CurriculumReviewWarningCode, string>;
