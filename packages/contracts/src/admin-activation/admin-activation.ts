import { z } from "zod";
import { AcceptanceModeSchema } from "../common/enums.js";
import { PasswordInputSchema, TokenSchema } from "../common/primitives.js";

/** `password` only for CREATE_ACCOUNT/CLAIM_ACCOUNT; SIGN_IN_REQUIRED relies on the session. */
export const AdminActivationRequestSchema = z.strictObject({ token: TokenSchema, password: PasswordInputSchema.optional() });
export type AdminActivationRequest = z.infer<typeof AdminActivationRequestSchema>;

export const AdminActivationPreviewSchema = z.strictObject({ email: z.email(), mode: AcceptanceModeSchema });
export type AdminActivationPreview = z.infer<typeof AdminActivationPreviewSchema>;

export const AdminActivatedSchema = z.strictObject({ role: z.literal("ADMIN") });
export type AdminActivated = z.infer<typeof AdminActivatedSchema>;
