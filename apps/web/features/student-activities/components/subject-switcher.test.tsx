import type { MyClassView } from "@repo/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { ONLY_SUBJECT, SUBJECT_UNAVAILABLE, subjectOptions } from "../schemas/student-activity";
import { SubjectSwitcher } from "./subject-switcher";

const myClass = (overrides: Partial<MyClassView>): MyClassView => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "ADS 3NA",
  code: "ADS-3NA",
  academicYear: 2026,
  period: "2026.2",
  teacherName: "Eder Professor",
  subjectName: "Object Oriented Programming",
  enrolledAt: "2026-11-10T12:00:00.000Z",
  ...overrides,
});
const POO = myClass({});
const SQL = myClass({ id: "22222222-2222-4222-8222-222222222222", subjectName: "Banco de Dados" });

function setup(items: MyClassView[], options: { currentId?: string; unavailable?: boolean } = {}) {
  const onChange = vi.fn();
  const view = render(
    <SubjectSwitcher
      options={subjectOptions(items)}
      currentId={options.currentId ?? items[0]!.id}
      unavailable={options.unavailable ?? false}
      onChange={onChange}
    />,
  );
  return { ...view, onChange, user: userEvent.setup() };
}

describe("026 SubjectSwitcher — o card \"Matéria\"", () => {
  it("026/FR-001 mostra \"Matéria\" e a matéria atual como \"<disciplina> · <turma>\"", () => {
    setup([POO, SQL]);
    const select = screen.getByLabelText("Matéria") as HTMLSelectElement;
    expect(select.value).toBe(POO.id);
    expect(select.selectedOptions[0]!.textContent).toBe("Object Oriented Programming · ADS 3NA");
  });

  it("026/US1-6 turma sem disciplina mostra só o nome da turma", () => {
    setup([myClass({ subjectName: null, name: "Lógica — manhã" })]);
    expect((screen.getByLabelText("Matéria") as HTMLSelectElement).selectedOptions[0]!.textContent).toBe("Lógica — manhã");
  });

  it("026/FR-002 dois rótulos iguais ganham o período e o professor (research D7)", () => {
    const again = myClass({ id: "33333333-3333-4333-8333-333333333333", period: "2027.1", teacherName: "Ana Professora" });
    setup([POO, again]);
    const labels = Array.from((screen.getByLabelText("Matéria") as HTMLSelectElement).options).map((option) => option.textContent);
    expect(labels).toEqual([
      "Object Oriented Programming · ADS 3NA · 2026.2 · Eder Professor",
      "Object Oriented Programming · ADS 3NA · 2027.1 · Ana Professora",
    ]);
  });

  it("026/FR-001 uma única matéria: \"Sua única matéria\"", () => {
    setup([POO]);
    expect(screen.getByText(ONLY_SUBJECT)).toBeTruthy();
  });

  it("026/FR-014 acessível, operável por teclado e escolhe a turma pelo id", async () => {
    const { container, onChange, user } = setup([POO, SQL]);
    await expectNoA11yViolations(container);
    await user.selectOptions(screen.getByLabelText("Matéria"), "Banco de Dados · ADS 3NA");
    expect(onChange).toHaveBeenCalledWith(SQL.id);
    expect(screen.queryByText(ONLY_SUBJECT)).toBeNull();
  });

  it("026/FR-011 com a matéria pedida indisponível, o aviso aparece acima do card", () => {
    setup([POO, SQL], { unavailable: true });
    expect(screen.getByText(SUBJECT_UNAVAILABLE)).toBeTruthy();
  });
});
