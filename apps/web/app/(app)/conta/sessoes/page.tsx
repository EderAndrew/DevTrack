import { redirect } from "next/navigation";
import { HOME_PATH } from "@/lib/navigation";

/** "Minhas sessões" is now a section of the profile page; old links keep working. */
export default function SessionsPage() {
  redirect(`${HOME_PATH}#minhas-sessoes`);
}
