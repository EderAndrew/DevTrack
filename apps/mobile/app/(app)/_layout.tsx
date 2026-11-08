import { Redirect, Stack } from "expo-router";
import { createContext, useContext } from "react";
import { type NotificationPermission, usePushRegistration } from "../../features/push/hooks/use-push-registration";
import { useSession } from "../../lib/session/session-provider";
import { useTheme } from "../../lib/theme";

const PermissionContext = createContext<NotificationPermission | null>(null);

/** The notification permission of this phone, for the "notificações desligadas" notice (US1-7). */
export const useNotificationPermission = () => useContext(PermissionContext);

/**
 * The signed-in part of the app: without a session, "Entrar"; with one, the phone registers for alerts
 * (024/FR-018) before the screens below.
 */
export default function SignedInLayout() {
  const { status } = useSession();
  const { colors } = useTheme();
  const permission = usePushRegistration(status === "signedIn");
  if (status === "loading") return null;
  if (status !== "signedIn") return <Redirect href="/entrar" />;
  return (
    <PermissionContext.Provider value={permission}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
    </PermissionContext.Provider>
  );
}
