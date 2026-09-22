"use client";

import type { MeView } from "@repo/contracts";
import { ChevronRight, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { HOME_PATH, USER_AREAS } from "@/lib/navigation";
import { LogoutButton } from "./logout-button";

const LINK = "text-sidebar-foreground no-underline";

export interface AppSidebarProps {
  me: Pick<MeView, "name" | "emailVerified" | "permissions"> | null;
}

/**
 * Side menu of the signed-in screens. "Usuários" groups the administration areas the user may
 * open (UX only; the API authorizes). An unverified e-mail sees none: every such route would
 * answer EMAIL_NOT_VERIFIED (FR-016).
 */
export function AppSidebar({ me }: AppSidebarProps) {
  const pathname = usePathname();
  const areas = me?.emailVerified ? USER_AREAS.filter((area) => me.permissions.includes(area.permission)) : [];

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/" className={`${LINK} px-2 py-1 text-xl font-bold`}>
          DevTrack
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Menu principal">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {areas.length > 0 ? (
                  <Collapsible asChild defaultOpen className="group/usuarios">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton>
                          <Users aria-hidden="true" />
                          Usuários
                          <ChevronRight
                            aria-hidden="true"
                            className="ml-auto transition-transform group-data-[state=open]/usuarios:rotate-90"
                          />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {areas.map((area) => (
                            <SidebarMenuSubItem key={area.href}>
                              <SidebarMenuSubButton asChild isActive={pathname === area.href}>
                                <Link href={area.href} className={LINK} aria-current={pathname === area.href ? "page" : undefined}>
                                  {area.label}
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : null}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === HOME_PATH}>
                    <Link href={HOME_PATH} className={LINK} aria-current={pathname === HOME_PATH ? "page" : undefined}>
                      <UserRound aria-hidden="true" />
                      Meu perfil
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter>
        {me ? <p className="m-0 truncate px-2 text-sm">{me.name}</p> : null}
        <div className="px-2">
          <LogoutButton />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
