import { useLocalSearchParams } from "expo-router";
import { StudentOccurrencesScreen } from "../../../../../../features/exam-room/components/student-occurrences-screen";

/** A student's occurrences (024/US2-4). */
export default function StudentOccurrencesRoute() {
  const { classId, activityId, attemptId } = useLocalSearchParams<{ classId: string; activityId: string; attemptId: string }>();
  return <StudentOccurrencesScreen classId={classId} activityId={activityId} attemptId={attemptId} />;
}
