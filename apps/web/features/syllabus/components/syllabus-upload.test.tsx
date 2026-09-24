import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { FakeXhr } from "../../../test/fake-xhr";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { SyllabusUpload } from "./syllabus-upload";
import { documentView } from "./test-fixtures";

const SUBJECT_ID = "00000000-0000-4000-8000-000000000123";
const MIB = 1024 * 1024;

const pdf = (name = "ementa.pdf") => new File(["%PDF-1.7"], name, { type: "application/pdf" });
const withSize = (file: File, size: number) => {
  Object.defineProperty(file, "size", { value: size });
  return file;
};

describe("004/US2 004/FR-051 SyllabusUpload — envio da ementa", () => {
  beforeEach(() => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
  });
  afterEach(() => vi.unstubAllGlobals());

  // The input's `accept` already filters the browser dialog; the client check also covers drops.
  const setup = () => userEvent.setup({ applyAccept: false });
  const input = () => screen.getByLabelText("Arquivo da ementa") as HTMLInputElement;

  it("004/US2-1 escolhe o arquivo, mostra o progresso e anuncia \"Ementa enviada.\"", async () => {
    const user = setup();
    const onUploaded = vi.fn();
    const { container } = renderWithProviders(<SyllabusUpload subjectId={SUBJECT_ID} onUploaded={onUploaded} />);

    expect(screen.getByText(/PDF, DOCX, PNG ou JPG, até 10 MB\./)).toBeTruthy();
    expect(input().accept).toBe(".pdf,.docx,.png,.jpg,.jpeg");
    expect(input().getAttribute("aria-describedby")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Enviar ementa" }) as HTMLButtonElement).disabled).toBe(true);

    const file = pdf("Ementa POO.pdf");
    await user.upload(input(), file);
    expect(screen.getByText("Arquivo escolhido: Ementa POO.pdf")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Enviar ementa" }));

    const xhr = FakeXhr.last;
    expect(xhr).toMatchObject({ method: "POST", url: `/api/subjects/${SUBJECT_ID}/syllabus-documents` });
    expect((xhr.body as FormData).get("file")).toBe(file);

    act(() => xhr.progress(40, 100));
    const bar = screen.getByRole("progressbar", { name: "Progresso do envio" });
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    await expectNoA11yViolations(container);

    const document = documentView(SUBJECT_ID);
    act(() => xhr.respond(201, JSON.stringify({ document, duplicate: false })));
    expect((await screen.findByRole("status")).textContent).toBe("Ementa enviada.");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/Arquivo escolhido/)).toBeNull();
    expect(onUploaded).toHaveBeenCalledWith({ document, duplicate: false });
  });

  it("004/US2-6 arquivo repetido: \"Este arquivo já foi enviado (versão N).\"", async () => {
    const user = setup();
    renderWithProviders(<SyllabusUpload subjectId={SUBJECT_ID} />);
    await user.upload(input(), pdf());
    await user.click(screen.getByRole("button", { name: "Enviar ementa" }));
    act(() => FakeXhr.last.respond(200, JSON.stringify({ document: documentView(SUBJECT_ID, { version: 3 }), duplicate: true })));
    expect((await screen.findByRole("status")).textContent).toBe("Este arquivo já foi enviado (versão 3).");
  });

  it("solta o arquivo na área de envio", async () => {
    renderWithProviders(<SyllabusUpload subjectId={SUBJECT_ID} />);
    fireEvent.dragOver(screen.getByTestId("area-de-envio"));
    fireEvent.drop(screen.getByTestId("area-de-envio"), { dataTransfer: { files: [pdf("solta.pdf")] } });
    expect(screen.getByText("Arquivo escolhido: solta.pdf")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Enviar ementa" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("004/US2-2 recusa no cliente por tipo e por tamanho, sem enviar", async () => {
    const user = setup();
    renderWithProviders(<SyllabusUpload subjectId={SUBJECT_ID} />);
    const before = FakeXhr.last;

    await user.upload(input(), new File(["MZ"], "programa.exe", { type: "application/x-msdownload" }));
    expect(screen.getByRole("alert").textContent).toBe("Envie um arquivo PDF, DOCX, PNG ou JPG.");
    expect((screen.getByRole("button", { name: "Enviar ementa" }) as HTMLButtonElement).disabled).toBe(true);

    await user.upload(input(), withSize(pdf("grande.pdf"), 10 * MIB + 1));
    expect(screen.getByRole("alert").textContent).toBe("O arquivo passa de 10 MB.");
    expect((screen.getByRole("button", { name: "Enviar ementa" }) as HTMLButtonElement).disabled).toBe(true);

    await user.upload(input(), withSize(pdf("limite.pdf"), 10 * MIB));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(FakeXhr.last).toBe(before);
  });

  it.each([
    [400, "FILE_MACROS", "Arquivos com macros não são aceitos."],
    [400, "FILE_PROTECTED", "Este arquivo está protegido por senha."],
    [413, "FILE_TOO_LARGE", "O arquivo passa de 10 MB."],
    [409, "SUBJECT_INACTIVE", "Esta disciplina está desativada. Reative-a para usá-la."],
  ])("004/US2-3 recusa do servidor %i %s → mensagem do catálogo", async (status, code, message) => {
    const user = setup();
    renderWithProviders(<SyllabusUpload subjectId={SUBJECT_ID} />);
    await user.upload(input(), pdf());
    await user.click(screen.getByRole("button", { name: "Enviar ementa" }));
    act(() => FakeXhr.last.respond(status, JSON.stringify({ statusCode: status, code, message: "x" })));
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(screen.getByText("Arquivo escolhido: ementa.pdf")).toBeTruthy();
  });

  it("004/SC-012 teclado: arquivo e depois Enviar ementa", async () => {
    const user = setup();
    renderWithProviders(<SyllabusUpload subjectId={SUBJECT_ID} />);
    await user.upload(input(), pdf());
    await expectTabOrder(user, [input(), screen.getByRole("button", { name: "Enviar ementa" })]);
  });
});
