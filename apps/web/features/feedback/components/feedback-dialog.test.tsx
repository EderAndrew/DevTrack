import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toast";
import { apiError, json } from "@/features/student-activities/components/test-fixtures";
import { FeedbackDialog } from "./feedback-dialog";

const SENT = { id: "aaaaaaaa-0000-4000-8000-000000000001", category: "PROBLEM", message: "x", status: "RECEIVED", createdAt: "2026-10-25T12:00:00.000Z" };

function setup(answers: (() => Response | Promise<Response>)[] = [() => json(201, SENT)]) {
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) !== "/api/me/feedbacks" || init?.method !== "POST") return apiError(404, "NOT_FOUND", "x");
      posts.push(JSON.parse(String(init.body)));
      return (answers.length > 1 ? answers.shift()! : answers[0]!)();
    }),
  );
  const view = renderWithProviders(
    <Toaster>
      <FeedbackDialog trigger={<Button>Enviar feedback</Button>} />
    </Toaster>,
  );
  return { ...view, posts, user: userEvent.setup() };
}

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Enviar feedback" }));
  return screen.getByRole("dialog", { name: "Enviar feedback" });
};

const fill = async (user: ReturnType<typeof userEvent.setup>, message = "A página travou ao salvar a resposta.") => {
  await user.click(screen.getByRole("radio", { name: /Problema/ }));
  await user.type(screen.getByRole("textbox", { name: /Mensagem/ }), message);
};

describe("020/US1 \"Enviar feedback\"", () => {
  beforeEach(() => window.history.pushState({}, "", "/painel"));
  afterEach(() => vi.unstubAllGlobals());

  it("020/US1-1 envia categoria, mensagem, a tela e um submissionId; fecha com o aviso de enviado", async () => {
    const { user, posts, container } = setup();
    window.history.pushState({}, "", "/minhas-atividades/abc-1?filtro=x#topo");
    await openDialog(user);
    await expectNoA11yViolations(container.ownerDocument.body);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts).toEqual([
      {
        submissionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        category: "PROBLEM",
        message: "A página travou ao salvar a resposta.",
        originPath: "/minhas-atividades/abc-1",
      },
    ]);
    expect(await screen.findByText("Feedback enviado. Obrigado!")).toBeTruthy();
  });

  it("020/US1-1 020/FR-002 tela fora do OriginPathSchema vai nula", async () => {
    const { user, posts } = setup();
    window.history.pushState({}, "", "/a%20b/c");
    await openDialog(user);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.originPath).toBeNull();
  });

  it("020/US1-2 sem categoria ou com menos de 10 caracteres: erros ligados ao campo e nada enviado", async () => {
    const { user, posts } = setup();
    await openDialog(user);
    await user.type(screen.getByRole("textbox", { name: /Mensagem/ }), "curto");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    const messageError = await screen.findByText("Escreva pelo menos 10 caracteres.");
    const textbox = screen.getByRole("textbox", { name: /Mensagem/ });
    expect(textbox.getAttribute("aria-invalid")).toBe("true");
    expect(textbox.getAttribute("aria-describedby")).toContain(messageError.closest("[id]")!.id);
    const categoryError = screen.getByText("Escolha uma categoria.");
    expect(screen.getByRole("group", { name: "Categoria" }).getAttribute("aria-describedby")).toBe(categoryError.closest("[id]")!.id);
    expect(posts).toEqual([]);
  });

  it("020/US1-2 o contador conta caracteres como o aluno vê (emoji conta 1) e recusa mais de 2.000", async () => {
    const { user, posts } = setup();
    await openDialog(user);
    const textbox = screen.getByRole("textbox", { name: /Mensagem/ });
    await user.type(textbox, "😀😀ç");
    expect(screen.getByText("3 de 2.000")).toBeTruthy();
    await user.clear(textbox);
    await user.click(textbox);
    await user.paste("a".repeat(2001));
    expect(screen.getByText("2001 de 2.000")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: /Elogio/ }));
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText("Use no máximo 2.000 caracteres.")).toBeTruthy();
    expect(posts).toEqual([]);
  });

  it("020/FR-016 categorias pelas setas; foco preso no diálogo e devolvido ao botão ao fechar", async () => {
    const { user } = setup();
    await openDialog(user);
    await user.click(screen.getByRole("radio", { name: /Problema/ }));
    await user.keyboard("{ArrowDown}");
    expect((screen.getByRole("radio", { name: /Sugestão/ }) as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: /Sugestão/ }));
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Enviar feedback" }));
  });

  it("020/US1-4 no 429 mostra o limite com o tempo do Retry-After e mantém o texto", async () => {
    const limited = () => new Response(JSON.stringify({ statusCode: 429, code: "RATE_LIMITED", message: "x" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(19 * 3600) },
    });
    const { user } = setup([limited]);
    await openDialog(user);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Você já enviou 5 feedbacks nas últimas 24 horas. Tente de novo em 19 horas.");
    expect((screen.getByRole("textbox", { name: /Mensagem/ }) as HTMLTextAreaElement).value).toBe("A página travou ao salvar a resposta.");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("020/US1-3 depois de uma falha de rede, a nova tentativa leva o mesmo submissionId; um novo diálogo leva outro", async () => {
    const { user, posts } = setup([
      () => {
        throw new TypeError("Failed to fetch");
      },
      () => json(201, SENT),
    ]);
    await openDialog(user);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Não foi possível enviar agora. Tente de novo.");
    expect((screen.getByRole("textbox", { name: /Mensagem/ }) as HTMLTextAreaElement).value).toBe("A página travou ao salvar a resposta.");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts).toHaveLength(2);
    expect(posts[1]!.submissionId).toBe(posts[0]!.submissionId);

    await openDialog(user);
    expect((screen.getByRole("textbox", { name: /Mensagem/ }) as HTMLTextAreaElement).value).toBe("");
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(posts).toHaveLength(3));
    expect(posts[2]!.submissionId).not.toBe(posts[0]!.submissionId);
  });
});
