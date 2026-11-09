import type { ExamMonitorStudent } from "@repo/contracts";
import { Notice, Screen, Text } from "../../../components/ui";
import { messageForError } from "../../mobile-auth/schemas/messages";
import { useExamRoom } from "../hooks/use-exam-room";
import { ExamRoom } from "./exam-room";
import { MuteSwitch } from "./mute-switch";

export interface ExamRoomScreenProps {
  classId: string;
  activityId: string;
  highlightStudentId?: string | null;
  onOpenStudent: (student: ExamMonitorStudent) => void;
}

/** The room's screen: the exam's title and class, the room, and a lost room (404) in words (FR-017). */
export function ExamRoomScreen({ classId, activityId, highlightStudentId, onOpenStudent }: ExamRoomScreenProps) {
  const room = useExamRoom(classId, activityId);
  return (
    <Screen>
      <Text variant="h1" accessibilityRole="header">
        {room.exam?.title ?? "Prova"}
      </Text>
      {room.exam ? (
        <Text variant="body" tone="textSecondary">
          {room.exam.className}
        </Text>
      ) : null}
      {room.exam ? <MuteSwitch classId={classId} activityId={activityId} muted={room.exam.muted} /> : null}
      {room.lost ? <Notice tone="danger">{messageForError(room.monitor.error)}</Notice> : null}
      <ExamRoom
        classId={classId}
        activityId={activityId}
        monitor={room.monitor.data}
        closed={room.closed}
        offline={room.offline}
        updatedAt={room.updatedAt}
        highlightStudentId={highlightStudentId}
        onOpenStudent={onOpenStudent}
      />
    </Screen>
  );
}
