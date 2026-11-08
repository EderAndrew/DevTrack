import type { ExamMonitorStudent } from "@repo/contracts";
import { Bell } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Dialog, Notice, Text } from "../../../components/ui";
import { BORDER_WIDTH, radii, spacing, TOUCH_TARGET } from "../../../components/ui/tokens";
import { useTheme } from "../../../lib/theme";
import { messageForError } from "../../mobile-auth/schemas/messages";
import { useSendNudge } from "../hooks/use-send-nudge";
import { CANCEL, lastNudgeDismissedLabel, NUDGE_PENDING, nudgeLabel, nudgeNotice, nudgeQuestion, SEND_NUDGE } from "../schemas/exam-room";

const ICON_SIZE = 22;

/**
 * The bell (025/US1, contracts/ui.md): shown only when the server says the student may get a warning
 * (`nudge.canSend`) or one is pending (then disabled, saying so in words). Tapping asks for confirmation with the
 * student's name; the send carries only ids (FR-006). A refusal says why and the room is read again.
 */
export function NudgeBell({ classId, activityId, student }: { classId: string; activityId: string; student: ExamMonitorStudent }) {
  const { colors } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const send = useSendNudge(classId, activityId);
  const nudge = student.nudge;
  if (!nudge || !student.attemptId) return null;
  const pending = nudge.pendingSince !== null;
  if (!nudge.canSend && !pending) {
    return nudge.lastDismissedAt ? <DismissedLine at={nudge.lastDismissedAt} /> : null;
  }
  const attemptId = student.attemptId;
  const disabled = pending || send.isPending;

  const confirm = () => {
    send.mutate(attemptId, { onSettled: () => setConfirming(false) });
  };

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={nudgeLabel(student.name)}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => {
            send.reset();
            setConfirming(true);
          }}
          style={({ pressed }) => [
            styles.bell,
            {
              backgroundColor: disabled ? colors.disabledBg : colors.surface,
              borderColor: pressed ? colors.ring : disabled ? colors.disabledBorder : colors.borderControl,
            },
          ]}
        >
          <Bell size={ICON_SIZE} color={disabled ? colors.disabledFg : colors.primary} accessibilityElementsHidden importantForAccessibility="no" />
        </Pressable>
        {pending ? (
          <Text variant="bodySm" tone="textSecondary" weight="600">
            {NUDGE_PENDING}
          </Text>
        ) : null}
      </View>
      {!pending && nudge.lastDismissedAt ? <DismissedLine at={nudge.lastDismissedAt} /> : null}
      {send.isError ? (
        <Notice tone="danger" live="alert">
          {messageForError(send.error)}
        </Notice>
      ) : null}
      <Dialog
        visible={confirming}
        title={nudgeQuestion(student.name)}
        description={nudgeNotice(student.name)}
        confirmLabel={SEND_NUDGE}
        cancelLabel={CANCEL}
        busy={send.isPending}
        onConfirm={confirm}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}

function DismissedLine({ at }: { at: string }) {
  return (
    <Text variant="caption" tone="textSecondary">
      {lastNudgeDismissedLabel(at)}
    </Text>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing[2] },
  row: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  bell: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    borderRadius: radii.md,
    borderWidth: BORDER_WIDTH,
    alignItems: "center",
    justifyContent: "center",
  },
});
