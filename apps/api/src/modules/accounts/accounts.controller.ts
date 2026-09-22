import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { uuidSchema } from "../../platform/http/schemas";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { type AccountPage, AccountsService, type UserAccountView } from "./accounts.service";

const listQuerySchema = z.strictObject({
  query: z.string().max(120).optional(),
  cursor: z.string().max(200).optional(),
});
const idPipe = new ZodValidationPipe(uuidSchema);

/** ADMIN-only identity administration (FR-056); MANAGER/TEACHER/STUDENT get 403. */
@Controller("users")
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @RequirePermissions("usuarios.visualizar")
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: z.output<typeof listQuerySchema>): Promise<AccountPage> {
    return this.accounts.list(query);
  }

  @Get(":id")
  @RequirePermissions("usuarios.visualizar")
  get(@Param("id", idPipe) id: string): Promise<UserAccountView> {
    return this.accounts.get(id);
  }

  @Post(":id/suspend")
  @RequirePermissions("usuarios.suspender")
  @HttpCode(200)
  suspend(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<UserAccountView> {
    return this.accounts.suspend(id, ctx.auth!, ctx.requestId);
  }

  @Post(":id/reactivate")
  @RequirePermissions("usuarios.reativar")
  @HttpCode(200)
  reactivate(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<UserAccountView> {
    return this.accounts.reactivate(id, ctx.auth!, ctx.requestId);
  }
}
