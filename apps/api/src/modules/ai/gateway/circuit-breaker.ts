import type { AiCircuitState } from "@repo/contracts";

/** What the gateway may do with a config now (contracts/gateway-routing.md). */
export type CircuitDecision = "CALL" | "PROBE" | "OPEN";

export interface CircuitSubject {
  key: string;
  provider: string;
  model: string;
}

/** A change of state worth auditing: into OPEN (again) or back to CLOSED. */
export interface CircuitTransition {
  to: "OPEN" | "CLOSED";
  configKey: string;
  provider: string;
  model: string;
  failures: number;
}

export interface CircuitOptions {
  failureThreshold: number;
  openSeconds: number;
  now?: () => number;
}

interface Circuit {
  state: AiCircuitState;
  failures: number;
  openUntil: number;
  /** HALF_OPEN with its only probe in flight. */
  probing: boolean;
}

/**
 * One circuit per model config (008 research G8, FR-013), in memory and per API instance: the
 * legs that end in a transient failure count; at the threshold the circuit opens and the model
 * isn't called; after the wait the first caller alone probes, and its success closes the circuit
 * while its transient failure opens it again. Other outcomes (success aside) don't count.
 */
export class CircuitBreaker {
  /** Set by the auditor; called once per transition, and awaited by the leg that caused it. */
  onTransition: ((transition: CircuitTransition) => void | Promise<void>) | null = null;
  private readonly circuits = new Map<string, Circuit>();
  /** Replaced in tests to pass the wait without sleeping. */
  now: () => number;

  constructor(private readonly options: CircuitOptions) {
    this.now = options.now ?? Date.now;
  }

  /** Asked before each leg; a PROBE must be followed by one `record*` call. */
  allow(key: string): CircuitDecision {
    const circuit = this.circuits.get(key);
    if (!circuit || circuit.state === "CLOSED") return "CALL";
    if (circuit.probing || this.now() < circuit.openUntil) return "OPEN";
    circuit.state = "HALF_OPEN";
    circuit.probing = true;
    return "PROBE";
  }

  /** Whether a call would be refused now, without taking the probe (availability). */
  blocks(key: string): boolean {
    const circuit = this.circuits.get(key);
    if (!circuit || circuit.state === "CLOSED") return false;
    return circuit.probing || this.now() < circuit.openUntil;
  }

  state(key: string): AiCircuitState {
    return this.circuits.get(key)?.state ?? "CLOSED";
  }

  async recordSuccess(config: CircuitSubject): Promise<void> {
    const circuit = this.circuits.get(config.key);
    if (!circuit) return;
    const wasOpen = circuit.state !== "CLOSED";
    this.circuits.delete(config.key);
    if (wasOpen) await this.emit("CLOSED", config, 0);
  }

  async recordTransientFailure(config: CircuitSubject): Promise<void> {
    const circuit = this.circuits.get(config.key) ?? { state: "CLOSED", failures: 0, openUntil: 0, probing: false };
    this.circuits.set(config.key, circuit);
    circuit.failures += 1;
    if (circuit.state === "HALF_OPEN" || (circuit.state === "CLOSED" && circuit.failures >= this.options.failureThreshold)) {
      circuit.state = "OPEN";
      circuit.probing = false;
      circuit.openUntil = this.now() + this.options.openSeconds * 1000;
      await this.emit("OPEN", config, circuit.failures);
    }
  }

  /** A leg that ended otherwise (permanent error, cancellation, deadline): no verdict. */
  recordOtherOutcome(config: CircuitSubject): void {
    const circuit = this.circuits.get(config.key);
    if (circuit?.probing) circuit.probing = false;
  }

  reset(): void {
    this.circuits.clear();
  }

  private async emit(to: CircuitTransition["to"], config: CircuitSubject, failures: number): Promise<void> {
    await this.onTransition?.({ to, configKey: config.key, provider: config.provider, model: config.model, failures });
  }
}
