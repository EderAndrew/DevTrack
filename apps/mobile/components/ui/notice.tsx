import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../lib/theme";
import { Text } from "./text";
import { BORDER_WIDTH, radii, spacing } from "./tokens";

export interface NoticeProps {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children?: ReactNode;
  /** `alert` interrupts the screen reader; `status` waits. */
  live?: "alert" | "status";
}

/** A message in a box of the Design System, announced to screen readers; always in words. */
export function Notice({ tone = "info", title, children, live = "status" }: NoticeProps) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole={live === "alert" ? "alert" : "summary"}
      accessibilityLiveRegion={live === "alert" ? "assertive" : "polite"}
      style={[styles.box, { backgroundColor: colors[`${tone}Surface`], borderColor: colors[tone] }]}
    >
      {title ? (
        <Text variant="label" tone={`${tone}Text`} weight="600">
          {title}
        </Text>
      ) : null}
      {typeof children === "string" ? (
        <Text variant="bodySm" tone="foreground">
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radii.md, borderWidth: BORDER_WIDTH, padding: spacing[3], gap: spacing[1] },
});
