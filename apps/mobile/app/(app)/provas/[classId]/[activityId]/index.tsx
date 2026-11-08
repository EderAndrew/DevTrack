import { useLocalSearchParams, useRouter } from "expo-router";
import { ExamRoomScreen } from "../../../../../features/exam-room/components/exam-room-screen";

/** The exam's room (024/US2); `?aluno=` highlights a student, as when opened from an alert (US3-5). */
export default function ExamRoomRoute() {
  const router = useRouter();
  const { classId, activityId, aluno } = useLocalSearchParams<{ classId: string; activityId: string; aluno?: string }>();
  return (
    <ExamRoomScreen
      classId={classId}
      activityId={activityId}
      highlightStudentId={aluno ?? null}
      onOpenStudent={(student) =>
        router.push({ pathname: "/provas/[classId]/[activityId]/alunos/[attemptId]", params: { classId, activityId, attemptId: student.attemptId! } })
      }
    />
  );
}
