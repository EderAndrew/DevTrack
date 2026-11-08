import type { IntegrityTimeline } from "@repo/contracts";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "../../../components/ui";
import { spacing } from "../../../components/ui/tokens";
import { formatTime, NO_OCCURRENCES, occurrenceLabel, warningLabel } from "../schemas/exam-room";

/**
 * A student's counted occurrences (024/US2-4, FR-009): what happened in the web's words, the server's time
 * and what it led to ("Aviso 2 de 3", "Prova retida"). Events that counted nothing are not listed.
 */
export function StudentOccurrences({ timeline }: { timeline: IntegrityTimeline }) {
  const holdOrdinals = new Set(timeline.holds.map((hold) => hold.occurrenceOrdinal));
  const counted = timeline.events
    .filter((event): event is typeof event & { occurrenceOrdinal: number } => event.occurrenceOrdinal !== null)
    .sort((a, b) => a.occurrenceOrdinal - b.occurrenceOrdinal);
  if (counted.length === 0) {
    return (
      <Text variant="body" tone="textSecondary">
        {NO_OCCURRENCES}
      </Text>
    );
  }
  return (
    <View style={styles.list}>
      {counted.map((event) => (
        <Card key={event.occurrenceOrdinal}>
          <Text variant="body" weight="600">{`${event.occurrenceOrdinal}. ${occurrenceLabel(event)}`}</Text>
          <Text variant="bodySm" tone="textSecondary">{`${formatTime(event.recordedAt)} — ${warningLabel(event.occurrenceOrdinal, holdOrdinals)}`}</Text>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ list: { gap: spacing[3] } });
