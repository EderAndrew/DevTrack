import type { IntegrityTimeline, TeacherExamNudge } from "@repo/contracts";
import { StyleSheet, View } from "react-native";
import { Badge, Card, Text } from "../../../components/ui";
import { spacing } from "../../../components/ui/tokens";
import { formatTime, NO_OCCURRENCES, NOT_AN_OCCURRENCE, nudgeOutcomeLabel, nudgeSentLabel, occurrenceLabel, warningLabel } from "../schemas/exam-room";

type CountedEvent = IntegrityTimeline["events"][number] & { occurrenceOrdinal: number };
type Line = { kind: "occurrence"; event: CountedEvent } | { kind: "nudge"; nudge: TeacherExamNudge };

/**
 * A student's counted occurrences (024/US2-4, FR-009): what happened in the web's words, the server's time
 * and what it led to ("Aviso 2 de 3", "Prova retida"). Events that counted nothing are not listed.
 * 025/US3-1: the teacher's warnings between them by the server's time, with the web's words and marked "Não é uma
 * ocorrência" (US3-4) — they never take a number of the 1–3.
 */
export function StudentOccurrences({ timeline }: { timeline: IntegrityTimeline }) {
  const holdOrdinals = new Set(timeline.holds.map((hold) => hold.occurrenceOrdinal));
  const counted = timeline.events
    .filter((event): event is CountedEvent => event.occurrenceOrdinal !== null)
    .sort((a, b) => a.occurrenceOrdinal - b.occurrenceOrdinal);
  const nudges = timeline.nudges ?? [];
  if (counted.length === 0 && nudges.length === 0) {
    return (
      <Text variant="body" tone="textSecondary">
        {NO_OCCURRENCES}
      </Text>
    );
  }
  return (
    <View style={styles.list}>
      {interleave(counted, nudges).map((line) =>
        line.kind === "occurrence" ? (
          <View key={`occurrence-${line.event.occurrenceOrdinal}`} testID={`timeline-occurrence-${line.event.occurrenceOrdinal}`}>
            <Card>
              <Text variant="body" weight="600">{`${line.event.occurrenceOrdinal}. ${occurrenceLabel(line.event)}`}</Text>
              <Text variant="bodySm" tone="textSecondary">{`${formatTime(line.event.recordedAt)} — ${warningLabel(line.event.occurrenceOrdinal, holdOrdinals)}`}</Text>
            </Card>
          </View>
        ) : (
          <View key={`nudge-${line.nudge.id}`} testID={`timeline-nudge-${nudges.indexOf(line.nudge) + 1}`}>
            <Card>
              <Text variant="body" weight="600">
                {nudgeSentLabel(line.nudge.sentAt)}
              </Text>
              <Text variant="bodySm" tone="textSecondary">
                {nudgeOutcomeLabel(line.nudge)}
              </Text>
              <Badge label={NOT_AN_OCCURRENCE} />
            </Card>
          </View>
        ),
      )}
    </View>
  );
}

/** The occurrences in their order, each warning placed before the first occurrence recorded after it was sent. */
function interleave(counted: readonly CountedEvent[], nudges: readonly TeacherExamNudge[]): Line[] {
  const pending = [...nudges];
  const lines: Line[] = [];
  for (const event of counted) {
    const at = Date.parse(event.recordedAt);
    while (pending.length > 0 && Date.parse(pending[0]!.sentAt) < at) lines.push({ kind: "nudge", nudge: pending.shift()! });
    lines.push({ kind: "occurrence", event });
  }
  return [...lines, ...pending.map((nudge): Line => ({ kind: "nudge", nudge }))];
}

const styles = StyleSheet.create({ list: { gap: spacing[3] } });
