/** 024: Jest + React Native Testing Library (constitution 3.7.0, "Stack oficial do mobile"). */
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/*.test.ts?(x)"],
  testPathIgnorePatterns: ["/node_modules/", "/.expo/"],
  setupFiles: ["<rootDir>/test/setup.ts"],
  // pnpm keeps packages under node_modules/.pnpm; React Native code there must be transformed too.
  transformIgnorePatterns: [
    "node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|lucide-react-native|@repo/.*))",
  ],
};
