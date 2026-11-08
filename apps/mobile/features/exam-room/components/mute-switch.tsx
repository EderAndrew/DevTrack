import { StyleSheet, View } from "react-native";
import { Badge, Notice, Switch } from "../../../components/ui";
import { spacing } from "../../../components/ui/tokens";
import { messageForError } from "../../mobile-auth/schemas/messages";
import { useExamAlertsMute } from "../hooks/use-exam-alerts-mute";
import { ALERTS_MUTED } from "../schemas/exam-room";

/**
 * The room's switch (024/US4, contracts/mobile-ui.md): "Silenciar avisos desta prova" while the alerts are on,
 * "Ligar avisos desta prova" while muted, with the "Avisos silenciados" badge. Changes at once; a refusal
 * puts it back and says why.
 */
export function MuteSwitch({ classId, activityId, muted }: { classId: string; activityId: string; muted: boolean }) {
  const mute = useExamAlertsMute(classId, activityId);
  return (
    <View style={styles.box}>
      <Switch
        label={muted ? "Ligar avisos desta prova" : "Silenciar avisos desta prova"}
        value={muted}
        onValueChange={(value) => mute.mutate(value)}
        disabled={mute.isPending}
      />
      {muted ? <Badge label={ALERTS_MUTED} tone="warning" /> : null}
      {mute.isError ? <Notice tone="danger">{messageForError(mute.error)}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: spacing[2] } });
