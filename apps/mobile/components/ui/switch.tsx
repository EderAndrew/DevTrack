import { Switch as NativeSwitch, StyleSheet, View } from "react-native";
import { useTheme } from "../../lib/theme";
import { Text } from "./text";
import { spacing, TOUCH_TARGET } from "./tokens";

export interface SwitchProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

/** A switch with its visible label as its accessible name and its state announced. */
export function Switch({ label, value, onValueChange, disabled = false }: SwitchProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.label}>
        <Text variant="body">{label}</Text>
      </View>
      <NativeSwitch
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled }}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.borderControl, true: colors.primary }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: TOUCH_TARGET, gap: spacing[3] },
  label: { flex: 1 },
});
