import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import EntrarScreen from "../../app/entrar";
import { useMe } from "../../features/mobile-auth/hooks/use-me";
import { setApiClientForTests } from "../../lib/api/instance";
import { useSession } from "../../lib/session/session-provider";
import { fakeApi, memoryStore, renderApp, teacherMe } from "../render";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }) }));
jest.mock("../../lib/config", () => ({ apiOrigin: () => "https://api.exemplo.br" }));

/** Reads `GET /me` while signed in, "Entrar" once the session ends: what the app's layouts do. */
function App() {
  const { status } = useSession();
  return status === "signedIn" ? <Probe /> : status === "signedOut" ? <EntrarScreen /> : null;
}
function Probe() {
  useMe();
  return null;
}

describe("024/US1-5 024/US1-6 sessão encerrada pelo servidor", () => {
  afterEach(() => setApiClientForTests(null));

  it("024/US1-5 024/US1-6 um 401 em qualquer pedido apaga o segredo e leva a Entrar com a mensagem de sessão expirada", async () => {
    // The real client over a fetch that answers 401, as after a revocation or an expiry.
    setApiClientForTests(null);
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({ statusCode: 401, code: "UNAUTHENTICATED", message: "x" }), { status: 401 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const store = memoryStore("c".repeat(43));
    await renderApp(<App />, { store });
    expect(await screen.findByText("Sua sessão expirou. Entre novamente para voltar a receber avisos.")).toBeOnTheScreen();
    expect(store.cleared).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.exemplo.br/api/me");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${"c".repeat(43)}`);
  });

  it("024/US1-1 Entrar leva para as provas depois do login", async () => {
    fakeApi({ "POST /auth/mobile/sessions": { token: "d".repeat(43), expiresAt: "2027-02-05T10:00:00.000Z", user: teacherMe } });
    await renderApp(<EntrarScreen />);
    await fireEvent.changeText(screen.getByLabelText("E-mail"), "prof@escola.br");
    await fireEvent.changeText(screen.getByLabelText("Senha"), "Senha-correta-1");
    await fireEvent.press(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/provas"));
    expect(screen.queryByText(/sessão expirou/)).toBeNull();
  });
});
