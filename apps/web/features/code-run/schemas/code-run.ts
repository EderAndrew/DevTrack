import type { CodeRunVerdict, ExecutionConvention } from "@repo/contracts";

// The Code Runner's words on the student's screen (019 contracts/web-ui.md). States are said in
// words, never by colour alone.

export const RUN_LABEL = "Executar";
export const RUNNING_LABEL = "Executando…";
export const RUN_HINT = "Executa o seu código com os casos públicos. Não vale pontos nem conclui o exercício.";
export const RUNNER_UNAVAILABLE = "Execução indisponível no momento. Você pode continuar respondendo e concluir normalmente.";
export const NO_PUBLIC_CASES = "Este exercício não tem casos para executar.";
export const QUEUED = "Na fila";
export const RUNNING = "Executando";
export const OTHER_QUESTION = "Há uma execução em andamento em outra questão. Aguarde o resultado dela.";
export const RUN_FAILED = "Não foi possível executar agora. Tente de novo.";
export const STALE_RESULT = "Este resultado é de uma versão anterior do seu código.";
export const COMPILATION_ERROR = "Erro de compilação";
export const COMPARISON_TITLE = "Como a saída é comparada";
export const COMPARISON_RULE = "Espaços no fim das linhas e linhas vazias no final são ignorados; o resto precisa ser igual.";

export const CONVENTIONS: Record<ExecutionConvention, string> = {
  STDIN_STDOUT: "Leia da entrada padrão e escreva na saída padrão.",
  JAVA_MAIN_CLASS: "Leia da entrada padrão e escreva na saída padrão. Em Java, a classe deve se chamar Main.",
};

export const VERDICT_LABELS: Record<CodeRunVerdict, string> = {
  PASSED: "Passou",
  WRONG_OUTPUT: "Saída diferente",
  RUNTIME_ERROR: "Erro de execução",
  TIME_LIMIT: "Tempo esgotado",
  MEMORY_LIMIT: "Memória excedida",
  OUTPUT_LIMIT: "Saída grande demais",
};

/** "2 de 3 casos públicos passaram": only public cases are ever counted. */
export function runSummary(passed: number, total: number): string {
  return `${passed} de ${total} ${total === 1 ? "caso público passou" : "casos públicos passaram"}`;
}

/** "até 2 s por caso, 256 MB", from the live worker's limits. */
export function limitsText(limits: { timeMs: number; memoryMb: number }): string {
  const seconds = limits.timeMs / 1000;
  return `Limites: até ${seconds.toLocaleString("pt-BR")} s por caso, ${limits.memoryMb} MB.`;
}

/** 429: "Muitas execuções seguidas. Tente de novo em N s." */
export function rateLimitedText(seconds: number | null): string {
  return seconds ? `Muitas execuções seguidas. Tente de novo em ${seconds} s.` : "Muitas execuções seguidas. Tente de novo em instantes.";
}
