import { describe, expect, it } from "vitest";
import { HelpAvailability } from "./help-availability";

describe("015/FR-004 HelpAvailability (research F1)", () => {
  it("sem registro, a ajuda está indisponível", async () => {
    await expect(new HelpAvailability().check()).resolves.toEqual({ available: false, reason: "AGENT_DISABLED" });
  });

  it("com registro, responde o que o módulo de ajuda disser, a cada consulta", async () => {
    const availability = new HelpAvailability();
    availability.register(async () => ({ available: true, reason: null }));
    await expect(availability.check()).resolves.toEqual({ available: true, reason: null });
    availability.register(async () => ({ available: false, reason: "MODEL_UNAVAILABLE" }));
    await expect(availability.check()).resolves.toEqual({ available: false, reason: "MODEL_UNAVAILABLE" });
  });
});
