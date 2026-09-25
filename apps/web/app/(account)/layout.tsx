import { cookies } from "next/headers";
import { accountLayoutFor } from "@/components/layout/account-layout";
import { AppShell } from "@/components/layout/app-shell";
import { StudentLayout } from "@/components/layout/student-layout";
import { getMeForNavigation } from "@/features/auth/api/server";

/**
 * Account screens (profile, sessions): the AppShell for whoever has a teacher or administration
 * area in the menu, otherwise the student layout (005 FR-024, US5-3). UX only.
 */
export default async function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [me, cookieStore] = await Promise.all([getMeForNavigation(), cookies()]);
  if (accountLayoutFor(me) === "student") return <StudentLayout me={me}>{children}</StudentLayout>;
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  return (
    <AppShell me={me} defaultOpen={defaultOpen}>
      {children}
    </AppShell>
  );
}
