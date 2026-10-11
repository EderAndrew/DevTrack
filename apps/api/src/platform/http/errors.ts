import type { ErrorBody, ErrorCode, ErrorDetails } from "@repo/contracts";

/**
 * Error catalogue of contracts/http-api.md (001, 003 and 004). Every error leaving the API has the shape
 * {statusCode, code, message}; messages are pt-BR and never carry data about the target.
 */
export const ErrorCatalog = {
  VALIDATION_ERROR: { status: 400, message: "Dados inválidos." },
  WEAK_PASSWORD: {
    status: 400,
    message: "A senha deve ter entre 12 e 128 caracteres e não pode ser uma senha comum.",
  },
  PASSWORD_REQUIRED: { status: 400, message: "Defina uma senha para continuar." },
  TOKEN_INVALID: { status: 400, message: "Link inválido ou expirado." },
  TOKEN_EXPIRED: { status: 400, message: "Este convite expirou." },
  RA_REQUIRED: { status: 400, message: "Informe o RA." },
  FILE_TYPE_NOT_ALLOWED: { status: 400, message: "Envie um arquivo PDF, DOCX, PNG ou JPG." },
  FILE_UNREADABLE: { status: 400, message: "Não foi possível abrir este arquivo." },
  FILE_PROTECTED: { status: 400, message: "Este arquivo está protegido por senha." },
  FILE_MACROS: { status: 400, message: "Arquivos com macros não são aceitos." },
  FILE_TOO_COMPLEX: { status: 400, message: "O arquivo tem páginas ou conteúdo demais para processar." },
  UNAUTHENTICATED: { status: 401, message: "Autenticação necessária." },
  INVALID_CREDENTIALS: { status: 401, message: "E-mail ou senha incorretos." },
  SIGN_IN_REQUIRED: { status: 401, message: "Entre na sua conta para continuar." },
  FORBIDDEN: { status: 403, message: "Você não possui permissão para esta operação." },
  EMAIL_NOT_VERIFIED: { status: 403, message: "Verifique seu e-mail para continuar." },
  ACCOUNT_SUSPENDED: { status: 403, message: "Esta conta está suspensa." },
  WRONG_ACCOUNT: {
    status: 403,
    message: "Você está conectado em outra conta. Entre com a conta do e-mail convidado.",
  },
  SELF_INVITE_FORBIDDEN: { status: 403, message: "Não é possível convidar a si mesmo." },
  SELF_ACTION_FORBIDDEN: { status: 403, message: "Não é possível executar esta operação sobre a própria conta." },
  ORIGIN_NOT_ALLOWED: { status: 403, message: "Origem da requisição não permitida." },
  NOT_FOUND: { status: 404, message: "Recurso não encontrado." },
  INVALID_STATE_TRANSITION: { status: 409, message: "Operação não permitida no estado atual." },
  ALREADY_TEACHER: { status: 409, message: "Esta pessoa já é professor." },
  ALREADY_MANAGER: { status: 409, message: "Esta pessoa já é gestor de cadastros." },
  TEACHER_REACTIVATION_REQUIRED: {
    status: 409,
    message: "O papel de professor desta pessoa está suspenso ou inativo. Use a reativação.",
  },
  INVITATION_ALREADY_PENDING: {
    status: 409,
    message: "Já existe um convite pendente para este e-mail. Reenvie o convite existente.",
  },
  LAST_ADMIN_PROTECTED: { status: 409, message: "Não é possível remover o último administrador ativo." },
  BOOTSTRAP_ALREADY_DONE: { status: 409, message: "Bootstrap administrativo já realizado." },
  CLASS_CODE_TAKEN: { status: 409, message: "Você já tem uma turma com este código." },
  CLASS_NOT_OPEN: { status: 409, message: "Esta turma não aceita novos alunos." },
  ALREADY_ENROLLED: { status: 409, message: "Este aluno já está matriculado nesta turma." },
  RA_TAKEN: { status: 409, message: "Este RA já está em uso." },
  SUBJECT_NAME_TAKEN: { status: 409, message: "Você já tem uma disciplina com este nome." },
  SUBJECT_INACTIVE: { status: 409, message: "Esta disciplina está desativada. Reative-a para usá-la." },
  CLASS_SUBJECT_LOCKED: {
    status: 409,
    message: "A disciplina da turma não pode mais ser trocada: o planejamento já usa a ementa dela.",
  },
  MEETINGS_OUTSIDE_PERIOD: {
    status: 409,
    message: "Há aulas marcadas fora das novas datas. Desmarque-as no calendário antes de mudar o período.",
  },
  REVISION_DRAFT_EXISTS: { status: 409, message: "Já existe uma revisão em andamento para esta versão da ementa." },
  REVISION_CONFIRMED: { status: 409, message: "Este conteúdo já foi confirmado e não pode ser alterado." },
  MEETING_HAS_TOPICS: {
    status: 409,
    message: "Esta aula tem tópicos planejados. Escolha o que fazer com eles antes de desmarcá-la.",
  },
  PLAN_REVISION_CONFLICT: {
    status: 409,
    message: "O planejamento foi alterado depois que você o abriu. Atualize a página antes de continuar.",
  },
  PLAN_ARCHIVED: { status: 409, message: "Este planejamento está arquivado e não pode ser alterado." },
  FILE_TOO_LARGE: { status: 413, message: "O arquivo passa de 10 MB." },
  CLASS_NOT_PLANNABLE: {
    status: 422,
    message: "Informe a disciplina e as datas de início e término da turma para planejar.",
  },
  EXTRACTION_UNAVAILABLE: {
    status: 422,
    message: "Não foi possível ler o texto deste arquivo. Preencha o conteúdo manualmente.",
  },
  REVISION_EMPTY: { status: 422, message: "Inclua ao menos um item antes de confirmar." },
  REVISION_NOT_CONFIRMED: { status: 422, message: "Confirme o conteúdo da ementa antes de usá-lo." },
  MEETING_OUT_OF_PERIOD: { status: 422, message: "A data está fora do período da turma." },
  TOO_MANY_MEETINGS: { status: 422, message: "A turma pode ter no máximo 200 aulas." },
  SYLLABUS_REQUIRED: { status: 422, message: "Envie e confirme a ementa antes de criar tópicos." },
  SYLLABUS_ITEM_NOT_IN_PLAN: { status: 422, message: "Este item não existe na versão da ementa usada agora." },
  PLAN_HAS_NO_TOPICS: { status: 422, message: "Crie ao menos um tópico antes de confirmar." },
  TOO_MANY_TOPICS: { status: 422, message: "O planejamento pode ter no máximo 300 tópicos." },
  MEETING_NOT_HELD_YET: { status: 422, message: "Só é possível concluir uma aula a partir da data dela." },
  AI_AGENT_NOT_FOUND: { status: 404, message: "Este recurso de IA não está disponível." },
  AI_AGENT_DISABLED: { status: 409, message: "Este recurso de IA está desativado no momento." },
  AI_MODEL_UNAVAILABLE: { status: 503, message: "A IA está indisponível no momento. Tente de novo mais tarde." },
  AI_EXECUTION_LIMIT_EXCEEDED: { status: 422, message: "O conteúdo enviado para a IA é grande demais." },
  AI_IDEMPOTENCY_KEY_REUSED: { status: 409, message: "Este pedido já foi feito com outros dados. Recarregue a página e tente de novo." },
  AI_PROPOSAL_ITEMS_INVALID: { status: 422, message: "Selecione ao menos um item, sem selecionar todos, para aprovar em parte." },
  AI_RESOURCE_TYPE_NOT_ACCEPTED: { status: 422, message: "Este recurso de IA não pode ser usado aqui." },
  AI_PROPOSAL_APPLY_REQUIRED: { status: 409, message: "Esta proposta é aprovada ao aplicá-la na ementa." },
  AI_OVERRIDE_NOT_ALLOWED: { status: 409, message: "Este modelo não pode ser fixado para esta tarefa." },
  EXERCISE_VERSION_CONFLICT: { status: 409, message: "Este exercício foi alterado depois que você o abriu. Atualize a página antes de continuar." },
  WORK_VERSION_CONFLICT: { status: 409, message: "Este trabalho mudou em outra aba. Recarregue para ver a versão atual." },
  SUBJECT_ARCHIVED: { status: 409, message: "Esta disciplina está arquivada e não pode ser usada para gerar exercícios." },
  SYLLABUS_LANGUAGE_REQUIRED: { status: 422, message: "Defina a linguagem da ementa para gerar exercícios de código." },
  SYLLABUS_NOT_READY_FOR_AI: {
    status: 409,
    message:
      "O preenchimento com IA precisa de um documento com texto (PDF com texto ou DOCX). Preencha o conteúdo manualmente.",
  },
  CURRICULUM_PROPOSAL_PENDING: {
    status: 409,
    message: "Já existe uma proposta aguardando revisão. Revise-a ou descarte-a para pedir uma nova análise.",
  },
  CURRICULUM_SOURCE_CHANGED: {
    status: 409,
    message: "O documento analisado não corresponde mais a esta proposta. Peça uma nova análise.",
  },
  CURRICULUM_PROPOSAL_INVALID: {
    status: 422,
    message: "Parte do conteúdo selecionado não pode ser aplicada. Desmarque o campo indicado e tente de novo.",
  },
  SUBJECT_MISMATCH: { status: 422, message: "Este trabalho é de outra disciplina. Aplique-o numa turma da mesma disciplina." },
  OUT_OF_SCOPE_NOT_ACKNOWLEDGED: { status: 422, message: "Confirme a aplicação com tópicos ainda não concluídos no planejamento desta turma." },
  SOURCE_NOT_APPROVED: { status: 422, message: "Só itens aprovados do seu banco podem ser aplicados a uma turma." },
  INVALID_SCHEDULE: { status: 422, message: "O prazo deve ser depois da data de publicação." },
  ALREADY_PUBLISHED: { status: 422, message: "A data de publicação não pode mudar depois que a atividade foi publicada." },
  CLASS_NOT_ACTIVE: { status: 409, message: "Esta turma não está ativa." },
  ACTIVITY_VERSION_CONFLICT: { status: 409, message: "Esta atividade mudou em outra aba. Recarregue para ver a versão atual." },
  SUBMISSION_VERSION_CONFLICT: { status: 409, message: "Esta correção mudou em outra aba. Recarregue para ver a versão atual." },
  NOT_SUBMITTED: { status: 409, message: "Este aluno ainda não entregou a atividade." },
  GRADE_OUT_OF_RANGE: { status: 422, message: "A nota da questão deve ficar entre 0 e o valor dela." },
  UNKNOWN_QUESTION: { status: 422, message: "Esta questão não pertence à atividade." },
  NOT_STARTED: { status: 409, message: "Inicie a atividade antes de responder." },
  ATTEMPT_ALREADY_SUBMITTED: { status: 409, message: "Esta atividade já foi entregue." },
  ANSWER_CHANGED_ELSEWHERE: { status: 409, message: "Uma resposta foi alterada em outra aba. Carregamos a versão mais recente; revise antes de entregar." },
  DEADLINE_PASSED: { status: 409, message: "O prazo desta atividade terminou e ela não aceita entrega atrasada. Suas respostas salvas continuam guardadas." },
  ACTIVITY_CLOSED: { status: 409, message: "Esta atividade foi encerrada pelo professor." },
  INVALID_ANSWER: { status: 422, message: "Esta resposta não é válida para a questão." },
  STUDENT_CAN_STILL_SUBMIT: { status: 409, message: "Este aluno ainda pode entregar a atividade." },
  ATTEMPT_NOT_COMPLETED: { status: 409, message: "Conclua a tentativa atual antes de refazer." },
  NOT_LATEST_ATTEMPT: { status: 409, message: "Esta tentativa já foi refeita. Carregamos a mais recente." },
  NOT_MARKABLE: { status: 422, message: "Esta resposta não precisa de correção do professor." },
  AI_HELP_UNAVAILABLE: { status: 503, message: "A ajuda está indisponível agora; tente de novo em instantes." },
  ACTIVITY_ALREADY_STARTED: { status: 409, message: "Não é possível mudar depois que um aluno iniciou." },
  NOT_CONTROLLED: { status: 409, message: "Esta atividade não está em modo controlado." },
  HELP_PENDING: { status: 409, message: "Aguarde a orientação anterior." },
  HELP_EXHAUSTED: { status: 409, message: "Você já usou as 3 ajudas deste trabalho." },
  HELP_NOT_ENABLED: { status: 409, message: "Esta atividade não tem ajuda da IA." },
  TYPING_LIMIT_EXCEEDED: { status: 422, message: "Esse trecho não foi salvo porque parece ter sido colado. Digite a resposta." },
  ATTEMPT_PAUSED: { status: 409, message: "Atividade pausada. Peça ao professor para liberar o seu retorno." },
  ATTENDANCE_STARTED: { status: 409, message: "O aluno já iniciou. Use Pausar aluno." },
  ATTENDANCE_NOT_REQUIRED: { status: 409, message: "Esta atividade não usa lista de chamada." },
  STUDENT_NOT_IN_CLASS: { status: 422, message: "Um dos alunos não está matriculado nesta turma." },
  // 017: a provider notice whose signature, timestamp or topic does not check; the provider is the
  // only caller, so the text never says which check failed (contracts/http-api.md).
  NOTICE_REJECTED: { status: 401, message: "Aviso recusado." },
  RATE_LIMITED: { status: 429, message: "Muitas tentativas. Tente novamente mais tarde." },
  INTERNAL_ERROR: { status: 500, message: "Erro interno. Tente novamente mais tarde." },
} as const satisfies Record<ErrorCode, { status: number; message: string }>;

export class AppException extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string = ErrorCatalog[code].message,
    /** Extra response headers, e.g. Retry-After for RATE_LIMITED. */
    readonly headers: Readonly<Record<string, string>> = {},
    /** Only where the contract lists them (016 `ATTENDANCE_STARTED`). */
    readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = "AppException";
    this.status = ErrorCatalog[code].status;
  }

  toBody(): ErrorBody {
    return { statusCode: this.status, code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) };
  }
}

export const validationError = () => new AppException("VALIDATION_ERROR");
export const weakPassword = () => new AppException("WEAK_PASSWORD");
export const passwordRequired = () => new AppException("PASSWORD_REQUIRED");
export const tokenInvalid = () => new AppException("TOKEN_INVALID");
export const tokenExpired = () => new AppException("TOKEN_EXPIRED");
export const raRequired = () => new AppException("RA_REQUIRED");
export const fileTypeNotAllowed = () => new AppException("FILE_TYPE_NOT_ALLOWED");
export const fileUnreadable = () => new AppException("FILE_UNREADABLE");
export const fileProtected = () => new AppException("FILE_PROTECTED");
export const fileMacros = () => new AppException("FILE_MACROS");
export const fileTooComplex = () => new AppException("FILE_TOO_COMPLEX");
export const unauthenticated = () => new AppException("UNAUTHENTICATED");
export const invalidCredentials = () => new AppException("INVALID_CREDENTIALS");
export const signInRequired = () => new AppException("SIGN_IN_REQUIRED");
export const forbidden = () => new AppException("FORBIDDEN");
export const emailNotVerified = () => new AppException("EMAIL_NOT_VERIFIED");
export const accountSuspended = () => new AppException("ACCOUNT_SUSPENDED");
export const wrongAccount = () => new AppException("WRONG_ACCOUNT");
export const selfInviteForbidden = () => new AppException("SELF_INVITE_FORBIDDEN");
export const selfActionForbidden = () => new AppException("SELF_ACTION_FORBIDDEN");
export const originNotAllowed = () => new AppException("ORIGIN_NOT_ALLOWED");
export const notFound = () => new AppException("NOT_FOUND");
export const invalidStateTransition = () => new AppException("INVALID_STATE_TRANSITION");
export const alreadyTeacher = () => new AppException("ALREADY_TEACHER");
export const alreadyManager = () => new AppException("ALREADY_MANAGER");
export const teacherReactivationRequired = () => new AppException("TEACHER_REACTIVATION_REQUIRED");
export const invitationAlreadyPending = () => new AppException("INVITATION_ALREADY_PENDING");
export const lastAdminProtected = () => new AppException("LAST_ADMIN_PROTECTED");
export const bootstrapAlreadyDone = () => new AppException("BOOTSTRAP_ALREADY_DONE");
export const classCodeTaken = () => new AppException("CLASS_CODE_TAKEN");
export const classNotOpen = () => new AppException("CLASS_NOT_OPEN");
export const alreadyEnrolled = () => new AppException("ALREADY_ENROLLED");
export const raTaken = () => new AppException("RA_TAKEN");
export const subjectNameTaken = () => new AppException("SUBJECT_NAME_TAKEN");
export const subjectInactive = () => new AppException("SUBJECT_INACTIVE");
export const classSubjectLocked = () => new AppException("CLASS_SUBJECT_LOCKED");
export const meetingsOutsidePeriod = () => new AppException("MEETINGS_OUTSIDE_PERIOD");
export const revisionDraftExists = () => new AppException("REVISION_DRAFT_EXISTS");
export const revisionConfirmed = () => new AppException("REVISION_CONFIRMED");
export const meetingHasTopics = () => new AppException("MEETING_HAS_TOPICS");
export const planRevisionConflict = () => new AppException("PLAN_REVISION_CONFLICT");
export const exerciseVersionConflict = () => new AppException("EXERCISE_VERSION_CONFLICT");
export const workVersionConflict = () => new AppException("WORK_VERSION_CONFLICT");
export const planArchived = () => new AppException("PLAN_ARCHIVED");
export const fileTooLarge = () => new AppException("FILE_TOO_LARGE");
export const classNotPlannable = () => new AppException("CLASS_NOT_PLANNABLE");
export const extractionUnavailable = () => new AppException("EXTRACTION_UNAVAILABLE");
export const revisionEmpty = () => new AppException("REVISION_EMPTY");
export const revisionNotConfirmed = () => new AppException("REVISION_NOT_CONFIRMED");
export const meetingOutOfPeriod = () => new AppException("MEETING_OUT_OF_PERIOD");
export const tooManyMeetings = () => new AppException("TOO_MANY_MEETINGS");
export const syllabusRequired = () => new AppException("SYLLABUS_REQUIRED");
export const syllabusItemNotInPlan = () => new AppException("SYLLABUS_ITEM_NOT_IN_PLAN");
export const planHasNoTopics = () => new AppException("PLAN_HAS_NO_TOPICS");
export const tooManyTopics = () => new AppException("TOO_MANY_TOPICS");
export const meetingNotHeldYet = () => new AppException("MEETING_NOT_HELD_YET");
export const rateLimited = (retryAfterSeconds: number) =>
  new AppException("RATE_LIMITED", undefined, {
    "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))),
  });
