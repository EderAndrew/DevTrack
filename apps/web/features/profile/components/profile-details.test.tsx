import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { ProfileDetails } from "./profile-details";

const me = {
  name: "Ana Souza",
  email: "ana@example.test",
  emailVerified: true,
  roles: [
    { key: "STUDENT", status: "ACTIVE" },
    { key: "TEACHER", status: "ACTIVE" },
  ],
} as const;

const valueOf = (term: string) => screen.getByText(term).nextElementSibling?.textContent;

describe("ProfileDetails (Meu perfil)", () => {
  it("mostra nome, e-mail e papéis com a situação", async () => {
    const { container } = render(<ProfileDetails me={{ ...me, roles: [...me.roles] }} />);
    expect(valueOf("Nome")).toBe("Ana Souza");
    expect(valueOf("E-mail")).toBe("ana@example.test");
    expect(valueOf("Papéis")).toBe("Aluno (Ativo), Professor (Ativo)");
    await expectNoA11yViolations(container);
  });

  it("indica e-mail não confirmado", () => {
    render(<ProfileDetails me={{ ...me, emailVerified: false, roles: [] }} />);
    expect(valueOf("E-mail")).toBe("ana@example.test (não confirmado)");
    expect(valueOf("Papéis")).toBe("Nenhum");
  });
});
