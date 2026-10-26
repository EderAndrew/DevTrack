import { describe, expect, it } from "vitest";
import { areaFor, STAFF_AREA_PERMISSIONS, startPathFor } from "./navigation";

describe("012/US2-5 012/SC-010 página inicial pela permissão (só UX; a API autoriza)", () => {
  it("aluno → Painel; professor → Minhas disciplinas, mesmo sendo também aluno; sem área → perfil", () => {
    expect(startPathFor(["turmas.proprias.listar", "atividades.proprias.visualizar"])).toBe("/painel");
    expect(startPathFor(["disciplinas.visualizar", "atividades.proprias.visualizar"])).toBe("/disciplinas");
    expect(startPathFor(["disciplinas.visualizar"])).toBe("/disciplinas");
    expect(startPathFor(["sessoes.proprias.listar"])).toBe("/conta/perfil");
  });

  it("Painel e Minhas atividades têm nome de área", () => {
    expect(areaFor("/painel")).toBe("Painel");
    expect(areaFor("/minhas-atividades")).toBe("Minhas atividades");
    expect(areaFor("/minhas-atividades/abc")).toBe("Minhas atividades");
    expect(areaFor("/historico")).toBe("Histórico");
  });
});

describe("020/US2-1 área Feedbacks do ADMIN", () => {
  it("tem nome de área e conta como área administrativa (AppShell)", () => {
    expect(areaFor("/admin/feedbacks")).toBe("Feedbacks");
    expect(areaFor("/admin/feedbacks/abc")).toBe("Feedbacks");
    expect(STAFF_AREA_PERMISSIONS).toContain("feedbacks.visualizar");
  });
});
