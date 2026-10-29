import { z } from "zod";

/**
 * `GET /code-runner/availability` (021 research Y10): the kill switch is on and a fresh heartbeat lists
 * at least one profile. Tells the teacher applying a work whether "Executar" would work right now.
 */
export const CodeRunnerAvailabilitySchema = z.strictObject({ available: z.boolean() });
export type CodeRunnerAvailability = z.infer<typeof CodeRunnerAvailabilitySchema>;
