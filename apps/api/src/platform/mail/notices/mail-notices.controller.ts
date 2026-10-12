import { Controller, HttpCode, Param, Post, Req } from "@nestjs/common";
import type { EmptyResponse } from "@repo/contracts";
import type { Request } from "express";
import { Public } from "../../../modules/access-control/decorators";
import { ProviderNotice } from "../../http/origin.guard";
import { Ctx, type RequestContext } from "../../http/request-context";
import { MailNoticesService } from "./mail-notices.service";

/**
 * `POST /mail/notices/:provider` (017 contracts/http-api.md): the provider's notices about each
 * e-mail. Public by design: no session and no Origin (`@ProviderNotice()`); the provider's
 * signature on the raw body is the authentication, checked by the service before anything else.
 * The raw body is kept for this path only, up to 256 KB (`app.setup.ts`).
 */
@Controller("mail/notices")
export class MailNoticesController {
  constructor(private readonly notices: MailNoticesService) {}

  @Post(":provider")
  @Public()
  @ProviderNotice()
  @HttpCode(200)
  async receive(@Param("provider") provider: string, @Req() req: Request, @Ctx() ctx: RequestContext): Promise<EmptyResponse> {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    await this.notices.receive(provider, { headers: req.headers, body }, ctx.ip);
    return {};
  }
}
