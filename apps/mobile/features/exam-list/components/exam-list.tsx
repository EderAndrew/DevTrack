import type { MobileExamListItem } from "@repo/contracts";
import { StyleSheet, View } from "react-native";
import { Badge, Card, Text } from "../../../components/ui";
import { spacing } from "../../../components/ui/tokens";
import { ALERTS_MUTED } from "../../exam-room/schemas/exam-room";

/** "HH:MM" of a server time, in the phone's time zone. */
export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** "Provas em andamento" (024/US2-1): one card per exam, its class and its latest end; empty in words. */
export function ExamList({ items, onOpen }: { items: readonly MobileExamListItem[]; onOpen: (item: MobileExamListItem) => void }) {
  if (items.length === 0) {
    return (
      <Text variant="body" tone="textSecondary">
        Nenhuma prova em andamento nas suas turmas.
      </Text>
    );
  }
  return (
    <View style={styles.list}>
      {items.map((item) => (
        <Card key={item.activityId} onPress={() => onOpen(item)} accessibilityLabel={`${item.title}, ${item.className}, encerra às ${clockTime(item.closesAt)}`}>
          <Text variant="h3">{item.title}</Text>
          <Text variant="bodySm" tone="textSecondary">
            {item.className}
          </Text>
          <Text variant="bodySm">{`Encerra às ${clockTime(item.closesAt)}`}</Text>
          {item.muted ? <Badge label={ALERTS_MUTED} tone="warning" /> : null}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ list: { gap: spacing[3] } });
