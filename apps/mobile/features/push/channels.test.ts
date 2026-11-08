import * as Notifications from "expo-notifications";
import { EXAM_CHANNELS, ensureExamChannels } from "./channels";

jest.mock("expo-notifications", () => ({
  AndroidImportance: { HIGH: 4, MAX: 5 },
  AndroidNotificationVisibility: { PRIVATE: 0, PUBLIC: 1, SECRET: -1 },
  setNotificationChannelAsync: jest.fn(async () => null),
}));

const mocked = Notifications as jest.Mocked<typeof Notifications>;

describe("024/US3-8 os canais do Android (research Y7)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("024/US3-8 dois canais, ambos privados na tela bloqueada; a retida vibra mais e com importância máxima", async () => {
    await ensureExamChannels("android");
    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledTimes(2);
    const [occurrences, holds] = mocked.setNotificationChannelAsync.mock.calls;
    expect(occurrences![0]).toBe("exam-occurrences");
    expect(occurrences![1]).toMatchObject({ importance: 4, vibrationPattern: [0, 250, 150, 250], lockscreenVisibility: 0 });
    expect(holds![0]).toBe("exam-holds");
    expect(holds![1]).toMatchObject({ importance: 5, vibrationPattern: [0, 600, 200, 600, 200, 600], lockscreenVisibility: 0 });
    expect(Object.keys(EXAM_CHANNELS)).toEqual(["exam-occurrences", "exam-holds"]);
  });

  it("024/FR-012 os canais tocam o som do sistema: nenhum nome de som, que o Android leria como arquivo próprio", async () => {
    await ensureExamChannels("android");
    for (const [, options] of mocked.setNotificationChannelAsync.mock.calls) expect(options).not.toHaveProperty("sound");
  });

  it("fora do Android não há canal a criar", async () => {
    await ensureExamChannels("ios");
    expect(mocked.setNotificationChannelAsync).not.toHaveBeenCalled();
  });
});
