/** 024: Jest + React Native Testing Library (constitution 3.7.0, "Stack oficial do mobile"). */
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/*.test.ts?(x)"],
  testPathIgnorePatterns: ["/node_modules/", "/.expo/"],
  setupFiles: ["<rootDir>/test/setup.ts"],
  // The first test of a file pays for loading React Native and the screen; on a CI runner that took more than
  // the default 5 s (PR #54). The tests use fake timers, so the limit hides no real wait.
  testTimeout: 15_000,
  // pnpm keeps packages under node_modules/.pnpm; React Native code there must be transformed too.
  transformIgnorePatterns: [
    "node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|lucide-react-native|@repo/.*))",
  ],
};
