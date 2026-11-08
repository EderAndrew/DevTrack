import { StyleSheet, TextInput, type TextInputProps, View } from "react-native";
import { typography } from "@repo/design-tokens";
import { fontFor, useTheme } from "../../lib/theme";
import { Text } from "./text";
import { BORDER_WIDTH, focusRing, radii, spacing, TOUCH_TARGET } from "./tokens";

export interface TextFieldProps extends Omit<TextInputProps, "style" | "placeholderTextColor"> {
  label: string;
  error?: string;
}

/** A labelled input of the Design System: the label is its accessible name, the error is announced. */
export function TextField({ label, error, ...input }: TextFieldProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text variant="label" weight="500">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        allowFontScaling
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.input,
          {
            color: colors.foreground,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.borderControl,
            borderWidth: error ? focusRing.width : BORDER_WIDTH,
            fontFamily: fontFor("sans", typography.body.fontWeight),
            fontSize: typography.body.fontSize,
          },
        ]}
        {...input}
      />
      {error ? (
        <Text variant="bodySm" tone="dangerText" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing[1] },
  input: { minHeight: TOUCH_TARGET, borderRadius: radii.md, paddingHorizontal: spacing[3] },
});
