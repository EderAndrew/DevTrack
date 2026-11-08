import { fireEvent, render, screen } from "@testing-library/react-native";
import { clockTime, ExamList } from "./exam-list";

const item = (n: number, muted = false) => ({
  activityId: `00000000-0000-4000-8000-00000000000${n}`,
  classId: "00000000-0000-4000-8000-000000000010",
  className: `Turma ${n}`,
  title: `Prova ${n}`,
  closesAt: `2026-11-07T1${n}:15:00.000Z`,
  muted,
});

describe("024/FR-006 lista de provas em andamento", () => {
  it("um cartão por prova com turma e horário de encerramento; silenciada em palavras", async () => {
    const onOpen = jest.fn();
    await render(<ExamList items={[item(1), item(2, true)]} onOpen={onOpen} />);
    expect(screen.getByText("Prova 1")).toBeOnTheScreen();
    expect(screen.getByText("Turma 2")).toBeOnTheScreen();
    expect(screen.getByText(`Encerra às ${clockTime(item(1).closesAt)}`)).toBeOnTheScreen();
    expect(screen.getAllByText("Avisos silenciados")).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: new RegExp("^Prova 2") }));
    expect(onOpen).toHaveBeenCalledWith(item(2, true));
  });

  it("sem provas, diz isso em palavras", async () => {
    await render(<ExamList items={[]} onOpen={jest.fn()} />);
    expect(screen.getByText("Nenhuma prova em andamento nas suas turmas.")).toBeOnTheScreen();
  });
});
