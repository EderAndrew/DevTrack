import { z } from "zod";

// Provider notices (017 contracts/http-api.md, research N6). The notice body belongs to the
// provider, not to the web: the API parses it in its adapters, so only the path is a contract.

/** The providers whose notices the API can accept; one of them is configured at a time. */
export const MailNoticeProviderSchema = z.enum(["resend", "ses"]);
export type MailNoticeProvider = z.infer<typeof MailNoticeProviderSchema>;

export const ProviderNoticeParamsSchema = z.strictObject({ provider: MailNoticeProviderSchema });
export type ProviderNoticeParams = z.infer<typeof ProviderNoticeParamsSchema>;
