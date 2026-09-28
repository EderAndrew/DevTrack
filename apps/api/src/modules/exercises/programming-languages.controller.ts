import { Controller, Get } from "@nestjs/common";
import type { ProgrammingLanguageList } from "@repo/contracts";
import { RequirePermissions } from "../access-control/decorators";
import { ProgrammingLanguagesService } from "./programming-languages.service";

/** The active programming languages (010 research X17); read-only, no write route. */
@Controller("programming-languages")
export class ProgrammingLanguagesController {
  constructor(private readonly languages: ProgrammingLanguagesService) {}

  @Get()
  @RequirePermissions("questoes.visualizar")
  list(): Promise<ProgrammingLanguageList> {
    return this.languages.list();
  }
}
