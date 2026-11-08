import { renderHook, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { fakeApi } from "../../../test/render";
import { usePushRegistration } from "./use-push-registration";

jest.mock("expo-notifications", () => ({
  AndroidImportance: { HIGH: 4, MAX: 5 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
}));

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const PUSH_TOKEN = "ExponentPushToken[abcdefghij123]";

describe("024/FR-018 o celular se registra para receber avisos depois de entrar", () => {
  beforeEach(() => jest.clearAllMocks());

  it("pede a permissão, pega o token do Expo e registra o celular na sessão", async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ status: "undetermined" } as never);
    mocked.requestPermissionsAsync.mockResolvedValue({ status: "granted" } as never);
    mocked.getExpoPushTokenAsync.mockResolvedValue({ data: PUSH_TOKEN, type: "expo" });
    const api = fakeApi({ "PUT /mobile/device": { id: "00000000-0000-4000-8000-000000000009", platform: "IOS" } });
    const { result } = await renderHook(() => usePushRegistration(true));
    await waitFor(() => expect(result.current).toBe("granted"));
    await waitFor(() => expect(api.calls).toHaveLength(1));
    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(api.calls[0]).toMatchObject({ method: "PUT", path: "/mobile/device", body: { pushToken: PUSH_TOKEN } });
  });

  it("registra de novo quando o token do aparelho muda", async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ status: "granted" } as never);
    mocked.getExpoPushTokenAsync.mockResolvedValue({ data: PUSH_TOKEN, type: "expo" });
    const api = fakeApi({ "PUT /mobile/device": { id: "00000000-0000-4000-8000-000000000009", platform: "IOS" } });
    await renderHook(() => usePushRegistration(true));
    await waitFor(() => expect(api.calls).toHaveLength(1));
    const listener = mocked.addPushTokenListener.mock.calls[0]![0] as (token: unknown) => void;
    listener({ type: "android", data: "novo" });
    await waitFor(() => expect(api.calls).toHaveLength(2));
  });

  it("024/US1-7 sem permissão não registra nada e informa que está desligada", async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ status: "denied" } as never);
    mocked.requestPermissionsAsync.mockResolvedValue({ status: "denied" } as never);
    const api = fakeApi({});
    const { result } = await renderHook(() => usePushRegistration(true));
    await waitFor(() => expect(result.current).toBe("denied"));
    expect(api.calls).toHaveLength(0);
    expect(mocked.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it("antes de entrar não pede nada", async () => {
    await renderHook(() => usePushRegistration(false));
    expect(mocked.getPermissionsAsync).not.toHaveBeenCalled();
  });
});
