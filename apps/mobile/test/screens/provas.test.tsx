import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import ProvasScreen from "../../app/(app)/provas";
import { fakeApi, memoryStore, renderApp } from "../render";

const mockReplace = jest.fn();
let mockPermission: string | null = "granted";
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("../../app/(app)/_layout", () => ({ useNotificationPermission: () => mockPermission }));

const exams = { items: [], serverNow: "2026-11-07T10:00:00.000Z" };

describe("024/US1 tela Provas em andamento", () => {
  beforeEach(() => jest.clearAllMocks());

  it("024/US1-7 com as notificações desligadas mostra o aviso permanente e o caminho para as configurações", async () => {
    mockPermission = "denied";
    fakeApi({ "GET /mobile/exams": exams });
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue();
    await renderApp(<ProvasScreen />, { store: memoryStore("e".repeat(43)) });
    expect(await screen.findByText("As notificações estão desligadas neste celular. Você não receberá avisos.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Abrir configurações" }));
    expect(openSettings).toHaveBeenCalled();
  });

  it("com as notificações ligadas não há aviso; Sair encerra e volta para Entrar", async () => {
    mockPermission = "granted";
    const api = fakeApi({ "GET /mobile/exams": exams, "DELETE /auth/mobile/sessions/current": undefined });
    await renderApp(<ProvasScreen />, { store: memoryStore("e".repeat(43)) });
    expect(await screen.findByText("Nenhuma prova em andamento nas suas turmas.")).toBeOnTheScreen();
    expect(screen.queryByText(/notificações estão desligadas/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Sair" }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/entrar"));
    expect(api.calls.map((call) => `${call.method} ${call.path}`)).toContain("DELETE /auth/mobile/sessions/current");
  });
});
