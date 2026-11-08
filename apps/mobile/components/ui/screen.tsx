import { gutter } from "@repo/design-tokens";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../lib/theme";
import { spacing } from "./tokens";

/** A screen's frame: the theme's background, the safe area, the web's side gutter; scrolls by default. */
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { colors } = useTheme();
  const body = <View style={styles.body}>{children}</View>;
  return (
    <SafeAreaView style={[styles.frame, { backgroundColor: colors.background }]}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  scroll: { flexGrow: 1 },
  body: { flex: 1, paddingHorizontal: gutter, paddingVertical: spacing[4], gap: spacing[4] },
});
