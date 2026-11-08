import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { Button, Notice, TextField } from "../../../components/ui";
import { spacing } from "../../../components/ui/tokens";
import { useLogin } from "../hooks/use-login";
import { type LoginFormInput, LoginFormSchema } from "../schemas/login";
import { messageForError } from "../schemas/messages";

/**
 * "Entrar" in the app (024/US1-1–US1-3): the account's e-mail and password; the API's refusal is shown in
 * words from its code — the web's generic message for wrong credentials, never which one was wrong.
 */
export function LoginForm({ onSignedIn }: { onSignedIn: () => void }) {
  const login = useLogin();
  const { control, handleSubmit, formState } = useForm<LoginFormInput>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: { email: "", password: "" },
  });
  const pending = formState.isSubmitting || login.isSuccess;

  const submit = handleSubmit(async (values) => {
    try {
      await login.mutateAsync({ email: values.email, password: values.password });
      onSignedIn();
    } catch {
      // The error stays in the mutation and is shown below.
    }
  });

  return (
    <View style={styles.form}>
      {login.error ? (
        <Notice tone="danger" title="Não foi possível entrar" live="alert">
          {messageForError(login.error)}
        </Notice>
      ) : null}
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <TextField
            label="E-mail"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <TextField
            label="Senha"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
          />
        )}
      />
      <Button label={pending ? "Entrando…" : "Entrar"} onPress={() => void submit()} loading={pending} />
    </View>
  );
}

const styles = StyleSheet.create({ form: { gap: spacing[4] } });
