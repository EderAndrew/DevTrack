import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../../lib/theme";
import { Text } from "./text";
import { BORDER_WIDTH, focusRing, radii, spacing, TOUCH_TARGET } from "./tokens";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}

/** A button of the Design System: visible text as its name, ≥ 44 pt, disabled and busy states announced. */
export function Button({ label, onPress, variant = "primary", disabled = false, loading = false, accessibilityHint }: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const palette = inactive
    ? { background: colors.disabledBg, border: colors.disabledBorder, text: "disabledFg" as const }
    : variant === "primary"
      ? { background: colors.primary, border: colors.primary, text: "primaryForeground" as const }
      : variant === "danger"
        ? { background: colors.danger, border: colors.danger, text: "primaryForeground" as const }
        : { background: colors.surface, border: colors.borderControl, text: "primary" as const };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: palette.background, borderColor: pressed ? colors.ring : palette.border },
        pressed && { borderWidth: focusRing.width },
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={colors.disabledFg} /> : null}
        <Text variant="label" tone={palette.text} weight="600">
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH_TARGET,
    borderRadius: radii.md,
    borderWidth: BORDER_WIDTH,
    paddingHorizontal: spacing[4],
    justifyContent: "center",
  },
  content: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing[2] },
});
