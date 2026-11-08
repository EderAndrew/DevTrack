import type { ExamMonitor, ExamMonitorStudent } from "@repo/contracts";
import { StyleSheet, View } from "react-native";
import { Badge, Card, Notice, Text } from "../../../components/ui";
import { spacing } from "../../../components/ui/tokens";
import { DECIDE_ON_COMPUTER, EXAM_CLOSED, examStatusLabel, OFFLINE, STATUS_TONES, STUDENTS_LABEL, updatedAtLabel } from "../schemas/exam-room";

export interface ExamRoomProps {
  monitor: ExamMonitor | undefined;
  closed: boolean;
  offline: boolean;
  /** The last successful read (ms), 0 before the first. */
  updatedAt: number;
  /** The student to highlight when the room was opened from an alert (024/US3-5). */
  highlightStudentId?: string | null;
  onOpenStudent: (student: ExamMonitorStudent) => void;
}

/**
 * The exam room on the phone (024/US2, contracts/mobile-ui.md): the students in the server's order (holds
 * first, then pauses), each with the web's situation in words; a held student says "Decida no computador"
 * and offers no decision (FR-010). Tapping a student with an attempt opens their occurrences.
 */
export function ExamRoom({ monitor, closed, offline, updatedAt, highlightStudentId, onOpenStudent }: ExamRoomProps) {
  return (
    <View style={styles.room}>
      {closed ? <Notice tone="info">{EXAM_CLOSED}</Notice> : null}
      {offline ? (
        <Notice tone="warning" title={OFFLINE} live="alert">
          {updatedAt > 0 ? updatedAtLabel(updatedAt) : ""}
        </Notice>
      ) : updatedAt > 0 ? (
        <Text variant="caption" tone="textSecondary">
          {updatedAtLabel(updatedAt)}
        </Text>
      ) : null}
      {monitor ? (
        <View style={styles.list} accessibilityLabel={STUDENTS_LABEL}>
          {monitor.students.map((student) => (
            <StudentRow
              key={student.studentUserId}
              student={student}
              label={examStatusLabel(student, monitor)}
              highlighted={student.studentUserId === highlightStudentId}
              onOpen={student.attemptId ? () => onOpenStudent(student) : undefined}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function StudentRow({ student, label, highlighted, onOpen }: { student: ExamMonitorStudent; label: string; highlighted: boolean; onOpen?: () => void }) {
  const awaiting = student.examStatus === "AWAITING_DECISION";
  return (
    <Card onPress={onOpen} accessibilityLabel={`${student.name}, ${label}${awaiting ? `, ${DECIDE_ON_COMPUTER}` : ""}`} highlighted={highlighted}>
      <Text variant="body" weight="600">
        {student.name}
      </Text>
      <Badge label={label} tone={STATUS_TONES[student.examStatus]} />
      {awaiting ? (
        <Text variant="bodySm" tone="warningText" weight="600">
          {DECIDE_ON_COMPUTER}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  room: { gap: spacing[3] },
  list: { gap: spacing[3] },
});
