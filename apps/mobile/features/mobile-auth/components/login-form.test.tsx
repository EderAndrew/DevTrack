import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { apiError, fakeApi, memoryStore, renderApp, teacherMe } from "../../../test/render";
import { LoginForm } from "./login-form";

const TOKEN = "a".repeat(43);
const session = { token: TOKEN, expiresAt: "2027-02-05T10:00:00.000Z", user: teacherMe };

async function fillAndSubmit(email = "prof@escola.br", password = "Senha-correta-1") {
  await fireEvent.changeText(screen.getByLabelText("E-mail"), email);
  await fireEvent.changeText(screen.getByLabelText("Senha"), password);
  await fireEvent.press(screen.getByRole("button", { name: "Entrar" }));
}

describe("024/US1 tela Entrar do aplicativo", () => {
  it("024/US1-1 com e-mail e senha certos guarda a sessão só no armazenamento seguro e segue para as provas", async () => {
    const api = fakeApi({ "POST /auth/mobile/sessions": session });
    const store = memoryStore();
    const onSignedIn = jest.fn();
    await renderApp(<LoginForm onSignedIn={onSignedIn} />, { store });
    await fillAndSubmit();
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(store.saved).toEqual([TOKEN]);
    expect(api.calls[0]).toMatchObject({ method: "POST", path: "/auth/mobile/sessions", anonymous: true, body: { email: "prof@escola.br", password: "Senha-correta-1" } });
  });

  it("024/US1-2 credenciais erradas mostram a mesma mensagem genérica da web", async () => {
    fakeApi({ "POST /auth/mobile/sessions": apiError(401, "INVALID_CREDENTIALS") });
    const onSignedIn = jest.fn();
    await renderApp(<LoginForm onSignedIn={onSignedIn} />);
    await fillAndSubmit();
    expect(await screen.findByText("E-mail ou senha incorretos.")).toBeOnTheScreen();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("024/US1-3 uma conta que não acompanha provas vê que o aplicativo é para professores", async () => {
    fakeApi({ "POST /auth/mobile/sessions": apiError(403, "MOBILE_NOT_ALLOWED") });
    const store = memoryStore();
    await renderApp(<LoginForm onSignedIn={jest.fn()} />, { store });
    await fillAndSubmit();
    expect(await screen.findByText("Este aplicativo é para professores acompanharem provas.")).toBeOnTheScreen();
    expect(store.saved).toEqual([]);
  });

  it("muitas tentativas mostram a espera; campos vazios mostram o que falta", async () => {
    fakeApi({ "POST /auth/mobile/sessions": apiError(429, "RATE_LIMITED", 90) });
    await renderApp(<LoginForm onSignedIn={jest.fn()} />);
    await fireEvent.press(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Informe seu e-mail.")).toBeOnTheScreen();
    expect(screen.getByText("Informe sua senha.")).toBeOnTheScreen();
    await fillAndSubmit();
    expect(await screen.findByText("Muitas tentativas. Tente novamente em 2 minutos.")).toBeOnTheScreen();
  });
});
