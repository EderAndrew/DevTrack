import { z } from "zod";
import { HealthStatusValueSchema } from "../common/enums.js";

/** Liveness/readiness probes; never internal details. */
export const HealthStatusSchema = z.strictObject({ status: HealthStatusValueSchema });
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
