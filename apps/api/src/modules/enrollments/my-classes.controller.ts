import { Controller, Get } from "@nestjs/common";
import type { MyCohortList } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { RequirePermissions } from "../access-control/decorators";
import { MyClassesService } from "./my-classes.service";

/** "Minhas turmas" of the student (003 contracts/http-api.md; 027 US8: by ano letivo and turma). */
@Controller("me/classes")
export class MyClassesController {
  constructor(private readonly myClasses: MyClassesService) {}

  @Get()
  @RequirePermissions("turmas.proprias.listar")
  list(@Ctx() ctx: RequestContext): Promise<MyCohortList> {
    return this.myClasses.list(ctx.auth!.userId);
  }
}
