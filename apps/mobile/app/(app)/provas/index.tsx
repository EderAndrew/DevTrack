import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Button, Notice, Screen, Text } from "../../../components/ui";
import { spacing } from "../../../components/ui/tokens";
import { ExamList } from "../../../features/exam-list/components/exam-list";
import { NotificationsOffNotice } from "../../../features/exam-list/components/notifications-off-notice";
import { useExams } from "../../../features/exam-list/hooks/use-exams";
import { useLogout } from "../../../features/mobile-auth/hooks/use-logout";
import { messageForError } from "../../../features/mobile-auth/schemas/messages";
import { useNotificationPermission } from "../_layout";

/** "Provas em andamento" (024/US1-1, US1-7, US2-1). */
export default function ProvasScreen() {
  const router = useRouter();
  const exams = useExams();
  const logout = useLogout();
  const permission = useNotificationPermission();
  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.title}>
          <Text variant="h1" accessibilityRole="header">
            Provas em andamento
          </Text>
        </View>
        <Button
          label="Sair"
          variant="secondary"
          loading={logout.isPending}
          onPress={() => logout.mutate(undefined, { onSettled: () => router.replace("/entrar") })}
        />
      </View>
      {permission === "denied" ? <NotificationsOffNotice /> : null}
      {exams.error ? <Notice tone="danger">{messageForError(exams.error)}</Notice> : null}
      {exams.data ? (
        <ExamList items={exams.data.items} onOpen={(item) => router.push({ pathname: "/provas/[classId]/[activityId]", params: { classId: item.classId, activityId: item.activityId } })} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  title: { flex: 1 },
});
