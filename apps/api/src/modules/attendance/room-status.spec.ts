import { describe, expect, it } from "vitest";
import { deriveRoomStatus } from "./room-status";

describe("016/FR-020 situação de cada aluno na sala (data-model.md, derivada)", () => {
  it("sem presença: não marcado, mesmo com pausa ou tentativa informadas", () => {
    expect(deriveRoomStatus({ marked: false, attemptStatus: null, pauseOpen: false })).toBe("NOT_MARKED");
    expect(deriveRoomStatus({ marked: false, attemptStatus: "IN_PROGRESS", pauseOpen: true })).toBe("NOT_MARKED");
  });

  it("marcado e sem tentativa: presente", () => {
    expect(deriveRoomStatus({ marked: true, attemptStatus: null, pauseOpen: false })).toBe("PRESENT");
  });

  it("tentativa aberta: respondendo; com a pausa aberta: fora da sala", () => {
    expect(deriveRoomStatus({ marked: true, attemptStatus: "IN_PROGRESS", pauseOpen: false })).toBe("ANSWERING");
    expect(deriveRoomStatus({ marked: true, attemptStatus: "IN_PROGRESS", pauseOpen: true })).toBe("OUT_OF_ROOM");
  });

  it("entregue: entregou, mesmo que uma pausa tenha terminado pela aceitação", () => {
    expect(deriveRoomStatus({ marked: true, attemptStatus: "SUBMITTED", pauseOpen: false })).toBe("SUBMITTED");
    expect(deriveRoomStatus({ marked: true, attemptStatus: "SUBMITTED", pauseOpen: true })).toBe("SUBMITTED");
  });
});
