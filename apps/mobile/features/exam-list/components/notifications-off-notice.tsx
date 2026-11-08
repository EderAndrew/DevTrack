import { Linking } from "react-native";
import { Button, Notice, Text } from "../../../components/ui";

/** 024/US1-7: permanent while the phone's notifications are off, with the way to turn them on. */
export function NotificationsOffNotice() {
  return (
    <Notice tone="warning" title="Notificações desligadas">
      <Text variant="bodySm">As notificações estão desligadas neste celular. Você não receberá avisos.</Text>
      <Button label="Abrir configurações" variant="secondary" onPress={() => void Linking.openSettings()} />
    </Notice>
  );
}
