import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { Pressable, Text } from "react-native";
import { useSession } from "../../../lib/session/session-provider";
import { memoryStore, renderApp } from "../../../test/render";
import { useNotificationResponse } from "./use-notification-response";

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock("expo-notifications", () => ({
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
}));

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const data = {
  kind: "HOLD",
  classId: "00000000-0000-4000-8000-0000000000c1",
  activityId: "00000000-0000-4000-8000-0000000000a1",
  studentUserId: "00000000-0000-4000-8000-000000000101",
};
const response = (content: unknown) => ({ notification: { request: { content: { data: content } } } }) as unknown as Notifications.NotificationResponse;
const room = { pathname: "/provas/[classId]/[activityId]", params: { classId: data.classId, activityId: data.activityId, aluno: data.studentUserId } };

function Probe() {
  useNotificationResponse();
  const session = useSession();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="entrar" onPress={() => void session.signIn("h".repeat(43))}>
      <Text>{session.status}</Text>
    </Pressable>
  );
}

const tapped = () => (mocked.addNotificationResponseReceivedListener.mock.calls.at(-1)![0] as (response: Notifications.NotificationResponse) => void);

describe("024/US3-5 tocar no aviso abre a sala com o aluno em destaque", () => {
  beforeEach(() => jest.clearAllMocks());

  it("024/US3-5 com a sessão aberta, o toque abre a sala daquela prova com o aluno", async () => {
    await renderApp(<Probe />, { store: memoryStore("g".repeat(43)) });
    await screen.findByText("signedIn");
    await act(async () => tapped()(response(data)));
    expect(mockPush).toHaveBeenCalledWith(room);
  });

  it("com o app fechado, o aviso que o abriu também leva à sala", async () => {
    mocked.getLastNotificationResponseAsync.mockResolvedValueOnce(response(data));
    await renderApp(<Probe />, { store: memoryStore("g".repeat(43)) });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(room));
  });

  it("024/FR-017 sem sessão, primeiro Entrar e depois do login a sala", async () => {
    await renderApp(<Probe />, { store: memoryStore(null) });
    await screen.findByText("signedOut");
    await act(async () => tapped()(response(data)));
    expect(mockReplace).toHaveBeenCalledWith("/entrar");
    expect(mockPush).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "entrar" }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(room));
  });

  it("um aviso com dados fora do contrato é ignorado", async () => {
    await renderApp(<Probe />, { store: memoryStore("g".repeat(43)) });
    await screen.findByText("signedIn");
    await act(async () => tapped()(response({ ...data, classId: "../../me" })));
    await act(async () => tapped()(response({ kind: "OCCURRENCE" })));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
