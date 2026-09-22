import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  type AccountPage,
  type UserAccountView,
  type UserListQuery,
  UserListQuerySchema,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { AccountsService } from "./accounts.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** ADMIN-only identity administration (FR-056); MANAGER/TEACHER/STUDENT get 403. */
@Controller("users")
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @RequirePermissions("usuarios.visualizar")
  list(@Query(new ZodValidationPipe(UserListQuerySchema)) query: UserListQuery): Promise<AccountPage> {
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
