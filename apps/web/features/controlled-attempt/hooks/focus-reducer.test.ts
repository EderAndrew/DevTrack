import { describe, expect, it } from "vitest";
import { type FocusSignal, type FocusState, focusReducer, INITIAL_FOCUS, initialFocus, SAME_EXIT_MS } from "./focus-reducer";

// 015 research F5: the signals of the window and the document → the integrity events, one exit
// per tab switch, window change or minimizing, the page's own dialogs never counted.

function run(signals: FocusSignal[], start: FocusState = INITIAL_FOCUS) {
  let state = start;
  const emitted: string[] = [];
  for (const signal of signals) {
    const step = focusReducer(state, signal);
    state = step.state;
    emitted.push(...step.emit);
  }
  return { state, emitted };
}

describe("015/FR-009 redutor de foco (research F5)", () => {
  it("015/US2-3 trocar de aba (blur + hidden em menos de 1 s) é uma saída; voltar (visible + focus) é um retorno", () => {
    const { emitted, state } = run([
      { type: "blur", at: 0 },
      { type: "hidden", at: 300 },
      { type: "visible", at: 5_000, focused: false },
      { type: "focus", at: 5_010 },
    ]);
    expect(emitted).toEqual(["SCREEN_LEFT", "SCREEN_RETURNED"]);
    expect(state.away).toBe(false);
  });

  it("outra janela (só blur) e minimizar (blur e depois hidden) são uma saída cada", () => {
    expect(run([{ type: "blur", at: 0 }, { type: "focus", at: 2_000 }]).emitted).toEqual(["SCREEN_LEFT", "SCREEN_RETURNED"]);
    expect(
      run([
        { type: "blur", at: 0 },
        { type: "hidden", at: 10_000 },
        { type: "visible", at: 20_000, focused: true },
      ]).emitted,
    ).toEqual(["SCREEN_LEFT", "SCREEN_RETURNED"]);
  });

  it("hidden logo depois de um blur conta uma vez; separados por mais de 1 s, mas ainda fora, também uma", () => {
    expect(run([{ type: "blur", at: 0 }, { type: "hidden", at: SAME_EXIT_MS }]).emitted).toEqual(["SCREEN_LEFT"]);
    expect(run([{ type: "hidden", at: 0 }, { type: "blur", at: 50 }]).emitted).toEqual(["SCREEN_LEFT"]);
  });

  it("no celular, visível de novo com o foco no documento já é o retorno, sem esperar o focus", () => {
    expect(run([{ type: "hidden", at: 0 }, { type: "visible", at: 3_000, focused: true }]).emitted).toEqual(["SCREEN_LEFT", "SCREEN_RETURNED"]);
  });

  it("duas saídas seguidas dão dois pares", () => {
    const { emitted } = run([
      { type: "blur", at: 0 },
      { type: "focus", at: 1_000 },
      { type: "blur", at: 2_000 },
      { type: "hidden", at: 2_100 },
      { type: "visible", at: 9_000, focused: true },
    ]);
    expect(emitted).toEqual(["SCREEN_LEFT", "SCREEN_RETURNED", "SCREEN_LEFT", "SCREEN_RETURNED"]);
  });

  it("os diálogos do próprio trabalho não tiram o foco da janela: focus sem saída não registra nada", () => {
    expect(run([{ type: "focus", at: 0 }, { type: "visible", at: 10, focused: true }]).emitted).toEqual([]);
  });

  it("015/US2-4 sair da tela cheia e voltar a ela; entrar sem ter saído não registra", () => {
    const start = initialFocus(true);
    expect(run([{ type: "fullscreen-exit", at: 0 }, { type: "fullscreen-enter", at: 4_000 }], start).emitted).toEqual([
      "FULLSCREEN_EXITED",
      "FULLSCREEN_ENTERED",
    ]);
    expect(run([{ type: "fullscreen-exit", at: 0 }]).emitted).toEqual([]);
    expect(run([{ type: "fullscreen-enter", at: 0 }], start).emitted).toEqual([]);
    expect(run([{ type: "fullscreen-enter", at: 0 }]).emitted).toEqual(["FULLSCREEN_ENTERED"]);
  });
});
