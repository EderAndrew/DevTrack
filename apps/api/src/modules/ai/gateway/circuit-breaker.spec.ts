import { describe, expect, it } from "vitest";
import { CircuitBreaker, type CircuitTransition } from "./circuit-breaker";

const CONFIG = { key: "cfg", provider: "p", model: "m" };

function breaker(threshold = 3, openSeconds = 60) {
  let now = 1_000_000;
  const transitions: CircuitTransition[] = [];
  const circuit = new CircuitBreaker({ failureThreshold: threshold, openSeconds, now: () => now });
  circuit.onTransition = (transition) => void transitions.push(transition);
  return { circuit, transitions, advance: (ms: number) => void (now += ms) };
}

describe("008/FR-013 circuito por configuração de modelo (research G8)", () => {
  it("abre no limite de falhas recuperáveis seguidas, uma transição só", async () => {
    const { circuit, transitions } = breaker(3);
    for (let i = 0; i < 2; i += 1) {
      expect(circuit.allow(CONFIG.key)).toBe("CALL");
      await circuit.recordTransientFailure(CONFIG);
    }
    expect(circuit.state(CONFIG.key)).toBe("CLOSED");
    await circuit.recordTransientFailure(CONFIG);
    expect(circuit.state(CONFIG.key)).toBe("OPEN");
    expect(circuit.allow(CONFIG.key)).toBe("OPEN");
    expect(circuit.blocks(CONFIG.key)).toBe(true);
    expect(transitions).toEqual([{ to: "OPEN", configKey: "cfg", provider: "p", model: "m", failures: 3 }]);
  });

  it("um sucesso zera a contagem", async () => {
    const { circuit } = breaker(3);
    await circuit.recordTransientFailure(CONFIG);
    await circuit.recordTransientFailure(CONFIG);
    await circuit.recordSuccess(CONFIG);
    await circuit.recordTransientFailure(CONFIG);
    await circuit.recordTransientFailure(CONFIG);
    expect(circuit.state(CONFIG.key)).toBe("CLOSED");
  });

  it("falha não recuperável não conta", async () => {
    const { circuit } = breaker(2);
    await circuit.recordTransientFailure(CONFIG);
    circuit.recordOtherOutcome(CONFIG);
    circuit.recordOtherOutcome(CONFIG);
    expect(circuit.state(CONFIG.key)).toBe("CLOSED");
    await circuit.recordTransientFailure(CONFIG);
    expect(circuit.state(CONFIG.key)).toBe("OPEN");
  });

  it("aberto recusa até vencer; vencido, só o primeiro recebe PROBE; sucesso fecha", async () => {
    const { circuit, transitions, advance } = breaker(1, 60);
    await circuit.recordTransientFailure(CONFIG);
    advance(59_999);
    expect(circuit.allow(CONFIG.key)).toBe("OPEN");
    advance(1);
    expect(circuit.blocks(CONFIG.key)).toBe(false);
    expect(circuit.allow(CONFIG.key)).toBe("PROBE");
    expect(circuit.state(CONFIG.key)).toBe("HALF_OPEN");
    expect(circuit.allow(CONFIG.key)).toBe("OPEN");
    expect(circuit.blocks(CONFIG.key)).toBe(true);
    await circuit.recordSuccess(CONFIG);
    expect(circuit.state(CONFIG.key)).toBe("CLOSED");
    expect(circuit.allow(CONFIG.key)).toBe("CALL");
    expect(transitions.map((t) => t.to)).toEqual(["OPEN", "CLOSED"]);
  });

  it("a chamada de teste que falha reabre por mais um período", async () => {
    const { circuit, transitions, advance } = breaker(1, 60);
    await circuit.recordTransientFailure(CONFIG);
    advance(60_000);
    expect(circuit.allow(CONFIG.key)).toBe("PROBE");
    await circuit.recordTransientFailure(CONFIG);
    expect(circuit.state(CONFIG.key)).toBe("OPEN");
    advance(59_999);
    expect(circuit.allow(CONFIG.key)).toBe("OPEN");
    advance(1);
    expect(circuit.allow(CONFIG.key)).toBe("PROBE");
    expect(transitions.map((t) => t.to)).toEqual(["OPEN", "OPEN"]);
  });

  it("uma chamada de teste sem veredito (cancelada, erro permanente) libera o teste seguinte", async () => {
    const { circuit, advance } = breaker(1, 60);
    await circuit.recordTransientFailure(CONFIG);
    advance(60_000);
    expect(circuit.allow(CONFIG.key)).toBe("PROBE");
    circuit.recordOtherOutcome(CONFIG);
    expect(circuit.state(CONFIG.key)).toBe("HALF_OPEN");
    expect(circuit.allow(CONFIG.key)).toBe("PROBE");
  });

  it("cada configuração tem o seu circuito, e reset os fecha todos", async () => {
    const { circuit } = breaker(1);
    await circuit.recordTransientFailure(CONFIG);
    expect(circuit.state("outra")).toBe("CLOSED");
    expect(circuit.allow("outra")).toBe("CALL");
    circuit.reset();
    expect(circuit.state(CONFIG.key)).toBe("CLOSED");
  });
});
