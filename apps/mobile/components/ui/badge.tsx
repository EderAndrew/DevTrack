import { StyleSheet, View } from "react-native";
import { useTheme } from "../../lib/theme";
import { Text } from "./text";
import { BORDER_WIDTH, radii, spacing } from "./tokens";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

/** A short status in words; the color only reinforces the text (024/FR-022: never color alone). */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  const { colors } = useTheme();
  const palette =
    tone === "neutral"
      ? { background: colors.surface, border: colors.border, text: "textSecondary" as const }
      : { background: colors[`${tone}Surface`], border: colors[tone], text: `${tone}Text` as const };
  return (
    <View accessible accessibilityLabel={label} style={[styles.badge, { backgroundColor: palette.background, borderColor: palette.border }]}>
      <Text variant="caption" tone={palette.text} weight="600">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: "flex-start", borderRadius: radii.sm, borderWidth: BORDER_WIDTH, paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
});
