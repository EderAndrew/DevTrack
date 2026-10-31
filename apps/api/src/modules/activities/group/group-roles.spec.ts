import { describe, expect, it } from "vitest";
import { canEdit, type GroupParticipant, groupRoles } from "./group-roles";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 30, 10, minute));
const member = (id: string, minute: number, overrides: Partial<GroupParticipant> = {}): GroupParticipant => ({
  id,
  joinedAt: at(minute),
  active: true,
  paused: false,
  ...overrides,
});

describe("023/FR-012 023/FR-023 papéis do grupo (research U9)", () => {
  it("líder e editor guardados valem enquanto ativos; vagas = máximo − participantes", () => {
    const roles = groupRoles({ leaderId: "a", editorId: "b", groupSize: 4, participants: [member("b", 1), member("a", 0)] });
    expect(roles).toMatchObject({ leaderId: "a", editorId: "b", freeSlots: 2 });
    expect(roles.members.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(canEdit(roles, "b")).toBe(true);
    expect(canEdit(roles, "a")).toBe(false);
  });

  it("editor pausado ou sem acesso: a edição volta ao líder", () => {
    for (const editor of [member("b", 1, { paused: true }), member("b", 1, { active: false })]) {
      const roles = groupRoles({ leaderId: "a", editorId: "b", groupSize: 3, participants: [member("a", 0), editor] });
      expect(roles.editorId).toBe("a");
      expect(canEdit(roles, "a")).toBe(true);
      expect(canEdit(roles, "b")).toBe(false);
    }
  });

  it("líder sem acesso: a liderança passa a quem entrou primeiro entre os ativos", () => {
    const roles = groupRoles({
      leaderId: "a",
      editorId: "a",
      groupSize: 5,
      participants: [member("a", 0, { active: false }), member("c", 2), member("b", 1)],
    });
    expect(roles).toMatchObject({ leaderId: "b", editorId: "b" });
  });

  it("o líder pausado continua líder e editor, mas não escreve", () => {
    const roles = groupRoles({ leaderId: "a", editorId: "a", groupSize: 2, participants: [member("a", 0, { paused: true }), member("b", 1)] });
    expect(roles).toMatchObject({ leaderId: "a", editorId: "a", freeSlots: 0 });
    expect(canEdit(roles, "a")).toBe(false);
  });

  it("ninguém ativo: sem líder nem editor", () => {
    const roles = groupRoles({ leaderId: "a", editorId: "a", groupSize: 2, participants: [member("a", 0, { active: false })] });
    expect(roles).toMatchObject({ leaderId: null, editorId: null });
    expect(canEdit(roles, "a")).toBe(false);
  });
});
