import { cookies } from "next/headers";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getMeForNavigation } from "@/features/auth/api/server";

/** Signed-in screens: side menu that expands or collapses to its icons (the choice is kept in a cookie), no header. */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [me, cookieStore] = await Promise.all([getMeForNavigation(), cookies()]);
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar me={me} />
      <SidebarInset id="conteudo" tabIndex={-1}>
        <div className="p-2">
          <SidebarTrigger />
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
