import { Modal, StyleSheet, View } from "react-native";
import { useTheme } from "../../lib/theme";
import { Button } from "./button";
import { Text } from "./text";
import { BORDER_WIDTH, radii, spacing } from "./tokens";

export interface DialogProps {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** The confirmation is in flight: both actions wait. */
  busy?: boolean;
}

/**
 * A confirmation of the Design System (025 contracts/ui.md): a modal over the theme's overlay, its title as the
 * screen reader's heading, one confirming and one cancelling action; Android's back button cancels.
 */
export function Dialog({ visible, title, description, confirmLabel, cancelLabel, onConfirm, onCancel, busy = false }: DialogProps) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View accessibilityViewIsModal style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text variant="h3" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="body" tone="textSecondary">
            {description}
          </Text>
          <View style={styles.actions}>
            <Button label={confirmLabel} onPress={onConfirm} loading={busy} />
            <Button label={cancelLabel} variant="secondary" onPress={onCancel} disabled={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", padding: spacing[4] },
  box: { borderRadius: radii.lg, borderWidth: BORDER_WIDTH, padding: spacing[4], gap: spacing[3] },
  actions: { gap: spacing[2] },
});
