/**
 * Jest setup of the app (024): the native modules the screens touch are replaced by in-memory fakes.
 * Each test file mocks `expo-router` and `expo-notifications` itself when it needs them.
 */
jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);
jest.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => void values.set(key, value)),
    deleteItemAsync: jest.fn(async (key: string) => void values.delete(key)),
  };
});
