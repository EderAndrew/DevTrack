import { Badge, Notice, Screen, Text } from "../../../components/ui";
import { messageForError } from "../../mobile-auth/schemas/messages";
import { useExamMonitor } from "../hooks/use-exam-room";
import { useStudentOccurrences } from "../hooks/use-student-occurrences";
import { examStatusLabel, STATUS_TONES } from "../schemas/exam-room";
import { NudgeBell } from "./nudge-bell";
import { StudentOccurrences } from "./student-occurrences";

/**
 * A student's occurrences, with the name and situation the room last read (024/US2-4), and the bell of the
 * discreet warning (025/US1), which follows the room as it is read again.
 */
export function StudentOccurrencesScreen({ classId, activityId, attemptId }: { classId: string; activityId: string; attemptId: string }) {
  const monitor = useExamMonitor(classId, activityId).data;
  const student = monitor?.students.find((row) => row.attemptId === attemptId);
  const timeline = useStudentOccurrences(classId, activityId, attemptId);
  return (
    <Screen>
      <Text variant="h1" accessibilityRole="header">
        {student?.name ?? "Ocorrências"}
      </Text>
      {student && monitor ? <Badge label={examStatusLabel(student, monitor)} tone={STATUS_TONES[student.examStatus]} /> : null}
      {student ? <NudgeBell classId={classId} activityId={activityId} student={student} /> : null}
      {timeline.error ? <Notice tone="danger">{messageForError(timeline.error)}</Notice> : null}
      {timeline.data ? <StudentOccurrences timeline={timeline.data} /> : null}
    </Screen>
  );
}
