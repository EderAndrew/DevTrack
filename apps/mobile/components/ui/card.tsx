import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../../lib/theme";
import { BORDER_WIDTH, radii, spacing } from "./tokens";

export interface CardProps {
  children: ReactNode;
  /** A pressable card is a button named by `accessibilityLabel`. */
  onPress?: () => void;
  accessibilityLabel?: string;
  highlighted?: boolean;
}

/** A surface of the Design System; pressable when it opens something. */
export function Card({ children, onPress, accessibilityLabel, highlighted = false }: CardProps) {
  const { colors } = useTheme();
  const style = [styles.card, { backgroundColor: colors.surface, borderColor: highlighted ? colors.ring : colors.border }];
  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [...style, pressed && { borderColor: colors.ring }]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, borderWidth: BORDER_WIDTH, padding: spacing[4], gap: spacing[2] },
});
