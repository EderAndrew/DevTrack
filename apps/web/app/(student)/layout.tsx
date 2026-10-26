import { cookies } from "next/headers";
import { StudentLayout } from "@/components/layout/student-layout";
import { getMeForNavigation } from "@/features/auth/api/server";
import { SendFeedbackButton } from "@/features/feedback/components/send-feedback-button";

/**
 * Student screens in the student layout (005 FR-024, research V13): the side menu with the
 * student's items; its collapsed choice is kept in the `sidebar_state` cookie, as in the AppShell.
 * "Enviar feedback" (020) is offered on every student page.
 */
export default async function StudentAreaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [me, cookieStore] = await Promise.all([getMeForNavigation(), cookies()]);
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  return (
    <StudentLayout me={me} defaultOpen={defaultOpen} feedback={<SendFeedbackButton />}>
      {children}
    </StudentLayout>
  );
}
