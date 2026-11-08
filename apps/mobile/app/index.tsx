import { Redirect } from "expo-router";
import { useSession } from "../lib/session/session-provider";

/** The app's entry: the exams when signed in, "Entrar" otherwise. */
export default function Index() {
  const { status } = useSession();
  if (status === "loading") return null;
  return <Redirect href={status === "signedIn" ? "/provas" : "/entrar"} />;
}
