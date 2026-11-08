import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Notice, Screen, Text } from "../components/ui";
import { spacing } from "../components/ui/tokens";
import { LoginForm } from "../features/mobile-auth/components/login-form";
import { SESSION_EXPIRED_MESSAGE } from "../features/mobile-auth/schemas/messages";
import { useSession } from "../lib/session/session-provider";

/** "Entrar" (024/US1-1, US1-6): the wordmark, the form and, after a revocation or expiry, why. */
export default function EntrarScreen() {
  const router = useRouter();
  const { expired } = useSession();
  return (
    <Screen>
      <View style={styles.brand} accessibilityRole="header">
        <Text variant="wordmark" font="brand" tone="primary" align="center">
          DevTrack
        </Text>
        <Text variant="body" tone="textSecondary" align="center">
          Acompanhe suas provas
        </Text>
      </View>
      {expired ? <Notice tone="info">{SESSION_EXPIRED_MESSAGE}</Notice> : null}
      <LoginForm onSignedIn={() => router.replace("/provas")} />
    </Screen>
  );
}

const styles = StyleSheet.create({ brand: { gap: spacing[2], paddingVertical: spacing[8] } });
