import { AiErrorCodeSchema, ErrorCodeSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { ApiError, NETWORK_ERROR, UNEXPECTED_RESPONSE } from "../api/client";
import { AI_ERROR_GUIDANCE, apiErrorCode, ERROR_MESSAGES, messageForError } from "./error-messages";

// Phase 001 texts, copied literally from the API's ErrorCatalog and the web's generic messages:
// moving the texts into the web must not change a single character on screen (FR-012, FR-013).
const PHASE_001_TEXTS = {
  VALIDATION_ERROR: "Dados inválidos.",
  WEAK_PASSWORD: "A senha deve ter entre 12 e 128 caracteres e não pode ser uma senha comum.",
  PASSWORD_REQUIRED: "Defina uma senha para continuar.",
  TOKEN_INVALID: "Link inválido ou expirado.",
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
  RATE_LIMITED: "Muitas tentativas. Tente novamente mais tarde.",
  INTERNAL_ERROR: "Erro interno. Tente novamente mais tarde.",
  [NETWORK_ERROR]: "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
  [UNEXPECTED_RESPONSE]: "Erro inesperado. Tente novamente mais tarde.",
};

// Codes added by 003, with the texts of specs/003-class-invitations-enrollment/contracts/web-ui.md.
const PHASE_003_TEXTS = {
  TOKEN_EXPIRED: "Este convite expirou.",
  RA_REQUIRED: "Informe o RA.",
  CLASS_CODE_TAKEN: "Você já tem uma turma com este código.",
  CLASS_NOT_OPEN: "Esta turma não aceita novos alunos.",
  ALREADY_ENROLLED: "Este aluno já está matriculado nesta turma.",
  RA_TAKEN: "Este RA já está em uso.",
};

// Codes added by 004, with the texts of specs/004-syllabus-planning/contracts/web-ui.md (and, for
// the codes the table leaves out, the API's own messages).
const PHASE_004_TEXTS = {
  FILE_TYPE_NOT_ALLOWED: "Envie um arquivo PDF, DOCX, PNG ou JPG.",
  FILE_UNREADABLE: "Não foi possível abrir este arquivo.",
  FILE_PROTECTED: "Este arquivo está protegido por senha.",
  FILE_MACROS: "Arquivos com macros não são aceitos.",
  FILE_TOO_COMPLEX: "O arquivo tem páginas ou conteúdo demais para processar.",
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
};

const PHASE_006_TEXTS: Record<string, string> = {
  AI_AGENT_NOT_FOUND: "Este recurso de IA não está disponível.",
  AI_AGENT_DISABLED: "Este recurso de IA está desativado no momento.",
  AI_MODEL_UNAVAILABLE: "A IA está indisponível no momento. Tente de novo mais tarde.",
  AI_EXECUTION_LIMIT_EXCEEDED: "O conteúdo enviado para a IA é grande demais.",
  AI_IDEMPOTENCY_KEY_REUSED: "Este pedido já foi feito com outros dados. Recarregue a página e tente de novo.",
  AI_PROPOSAL_ITEMS_INVALID: "Selecione ao menos um item, sem selecionar todos, para aprovar em parte.",
  AI_RESOURCE_TYPE_NOT_ACCEPTED: "Este recurso de IA não pode ser usado aqui.",
};

const PHASE_007_TEXTS: Record<string, string> = {
  AI_PROPOSAL_APPLY_REQUIRED: "Esta proposta é aprovada ao aplicá-la na ementa.",
  SYLLABUS_NOT_READY_FOR_AI:
    "O preenchimento com IA precisa de um documento com texto (PDF com texto ou DOCX). Preencha o conteúdo manualmente.",
  CURRICULUM_PROPOSAL_PENDING:
    "Já existe uma proposta aguardando revisão. Revise-a ou descarte-a para pedir uma nova análise.",
  CURRICULUM_SOURCE_CHANGED: "O documento analisado não corresponde mais a esta proposta. Peça uma nova análise.",
  CURRICULUM_PROPOSAL_INVALID:
    "Parte do conteúdo selecionado não pode ser aplicada. Desmarque o campo indicado e tente de novo.",
};

const PHASE_009_TEXTS: Record<string, string> = {
  AI_OVERRIDE_NOT_ALLOWED: "Este modelo não pode ser fixado para esta tarefa.",
};

const PHASE_010_TEXTS: Record<string, string> = {
  EXERCISE_VERSION_CONFLICT: "Este exercício foi alterado depois que você o abriu. Atualize a página antes de continuar.",
  SUBJECT_ARCHIVED: "Esta disciplina está arquivada e não pode ser usada para gerar exercícios.",
  SYLLABUS_LANGUAGE_REQUIRED: "Defina a linguagem da ementa para gerar exercícios de código.",
};

const PHASE_011_TEXTS: Record<string, string> = {
  WORK_VERSION_CONFLICT: "Este trabalho mudou em outra aba. Recarregue para ver a versão atual.",
};

// Codes added by 012 (specs/012-student-portal/contracts/http-api.md, tasks T003).
const PHASE_012_TEXTS: Record<string, string> = {
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
};

const PHASE_013_TEXTS = {
  ATTEMPT_NOT_COMPLETED: "Conclua a tentativa atual antes de refazer.",
  NOT_LATEST_ATTEMPT: "Esta tentativa já foi refeita. Carregamos a mais recente.",
  NOT_MARKABLE: "Esta resposta não precisa de correção do professor.",
};

const PHASE_015_TEXTS = {
  AI_HELP_UNAVAILABLE: "A ajuda está indisponível agora; tente de novo em instantes.",
  ACTIVITY_ALREADY_STARTED: "Não é possível mudar depois que um aluno iniciou.",
  NOT_CONTROLLED: "Esta atividade não está em modo controlado.",
  HELP_PENDING: "Aguarde a orientação anterior.",
  HELP_EXHAUSTED: "Você já usou as 3 ajudas deste trabalho.",
  HELP_NOT_ENABLED: "Esta atividade não tem ajuda da IA.",
  TYPING_LIMIT_EXCEEDED: "Esse trecho não foi salvo porque parece ter sido colado. Digite a resposta.",
};

const PHASE_016_TEXTS = {
  ATTEMPT_PAUSED: "Atividade pausada. Peça ao professor para liberar o seu retorno.",
  ATTENDANCE_STARTED: "O aluno já iniciou. Use Pausar aluno.",
  ATTENDANCE_NOT_REQUIRED: "Esta atividade não usa lista de chamada.",
  STUDENT_NOT_IN_CLASS: "Um dos alunos não está matriculado nesta turma.",
};

// Codes added by 018, with the texts of specs/018-controlled-exams/tasks.md (T002).
const PHASE_018_TEXTS = {
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
};

const ALL_TEXTS = { ...PHASE_001_TEXTS, ...PHASE_003_TEXTS, ...PHASE_004_TEXTS, ...PHASE_006_TEXTS, ...PHASE_007_TEXTS, ...PHASE_009_TEXTS, ...PHASE_010_TEXTS, ...PHASE_011_TEXTS, ...PHASE_012_TEXTS, ...PHASE_013_TEXTS, ...PHASE_015_TEXTS, ...PHASE_016_TEXTS, ...PHASE_018_TEXTS };

const apiError = (code: string, retryAfterSeconds: number | null = null) =>
  new ApiError(400, code, "texto enviado pela API", retryAfterSeconds);

describe("002/US2-3 catálogo de mensagens de erro do web (002/SC-004)", () => {
  it("007/FR-040 cobre os 116 códigos do contrato que chegam ao web e os 2 códigos do web, com os textos da Fase 001, da 003, da 004, da 006, da 007, da 009, da 010, da 011, da 012, da 013, da 015, da 016 e da 018", () => {
    expect(ERROR_MESSAGES).toEqual(ALL_TEXTS);
    const webCodes = ErrorCodeSchema.options.filter((code) => code !== "NOTICE_REJECTED" && code !== "NOTICE_TOO_LARGE");
    expect(Object.keys(ERROR_MESSAGES)).toEqual(expect.arrayContaining(webCodes));
    expect(Object.keys(ERROR_MESSAGES)).toHaveLength(118);
  });

  it.each(["NOTICE_REJECTED", "NOTICE_TOO_LARGE"])("017 %s só chega ao provedor de e-mail: o web não tem texto para ele", (code) => {
    expect(ErrorCodeSchema.options).toContain(code);
    expect(Object.keys(ERROR_MESSAGES)).not.toContain(code);
    expect(messageForError(apiError(code))).toBe(PHASE_001_TEXTS[UNEXPECTED_RESPONSE]);
  });

  it.each(Object.entries(ALL_TEXTS))("%s → texto do catálogo, não o message da API", (code, text) => {
    expect(messageForError(apiError(code))).toBe(text);
  });

  it("código desconhecido e erro que não é ApiError → texto de UNEXPECTED_RESPONSE", () => {
    expect(messageForError(apiError("SOME_FUTURE_CODE"))).toBe(PHASE_001_TEXTS[UNEXPECTED_RESPONSE]);
    expect(messageForError(new Error("boom"))).toBe(PHASE_001_TEXTS[UNEXPECTED_RESPONSE]);
    expect(messageForError("boom")).toBe(PHASE_001_TEXTS[UNEXPECTED_RESPONSE]);
  });

  it.each([
    [30, "Muitas tentativas. Tente novamente em 1 minuto."],
    [60, "Muitas tentativas. Tente novamente em 1 minuto."],
    [61, "Muitas tentativas. Tente novamente em 2 minutos."],
    [900, "Muitas tentativas. Tente novamente em 15 minutos."],
  ])("RATE_LIMITED com Retry-After de %i s → %s", (seconds, text) => {
    expect(messageForError(apiError("RATE_LIMITED", seconds))).toBe(text);
  });

  it("RATE_LIMITED sem Retry-After → texto do catálogo", () => {
    expect(messageForError(apiError("RATE_LIMITED"))).toBe(PHASE_001_TEXTS.RATE_LIMITED);
    expect(messageForError(apiError("RATE_LIMITED", 0))).toBe(PHASE_001_TEXTS.RATE_LIMITED);
  });
});

describe("apiErrorCode", () => {
  it("devolve o código de um ApiError e undefined para o resto", () => {
    expect(apiErrorCode(new ApiError(400, "WEAK_PASSWORD", "x"))).toBe("WEAK_PASSWORD");
    expect(apiErrorCode(new Error("x"))).toBeUndefined();
    expect(apiErrorCode(undefined)).toBeUndefined();
  });
});

describe("006/FR-066 orientação dos erros de execução de IA", () => {
  it("cobre os 13 códigos normalizados, com título e orientação, sem citar provedor nem modelo", () => {
    expect(Object.keys(AI_ERROR_GUIDANCE).sort()).toEqual([...AiErrorCodeSchema.options].sort());
    for (const { title, guidance } of Object.values(AI_ERROR_GUIDANCE)) {
      expect(title.length).toBeGreaterThan(0);
      expect(guidance.length).toBeGreaterThan(0);
      expect(`${title} ${guidance}`).not.toMatch(/provedor|modelo|provider|model/i);
    }
  });
});
