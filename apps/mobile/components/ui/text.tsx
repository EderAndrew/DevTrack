import { type ThemeColors, typography } from "@repo/design-tokens";
import type { ReactNode } from "react";
import { Text as NativeText, type TextProps as NativeTextProps } from "react-native";
import { fontFor, type FontRole, useTheme } from "../../lib/theme";

export type TextVariant = keyof typeof typography;
export type TextTone = "foreground" | "textSecondary" | "primary" | "successText" | "warningText" | "dangerText" | "infoText" | "primaryForeground" | "disabledFg";

export interface TextProps extends Omit<NativeTextProps, "style" | "role"> {
  variant?: TextVariant;
  tone?: TextTone;
  /** The font role of the tokens (`sans`, `brand` for the wordmark, `mono`). */
  font?: FontRole;
  weight?: "400" | "500" | "600" | "700";
  align?: "left" | "center" | "right";
  children: ReactNode;
}

/** Text of the Design System: a step of the type scale, a text color of the theme, scaling with the system font. */
export function Text({ variant = "body", tone = "foreground", font = "sans", weight, align, children, ...rest }: TextProps) {
  const { colors } = useTheme();
  const step = typography[variant];
  return (
    <NativeText
      allowFontScaling
      {...rest}
      style={{
        color: colors[tone as keyof ThemeColors],
        fontFamily: fontFor(font, weight ?? step.fontWeight),
        fontSize: step.fontSize,
        lineHeight: step.lineHeight,
        textAlign: align,
      }}
    >
      {children}
    </NativeText>
  );
}
