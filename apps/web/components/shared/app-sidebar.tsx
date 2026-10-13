"use client";

import type { MeView } from "@repo/contracts";
import { Activity, BookOpen, ChevronRight, ClipboardList, FileCheck2, Library, ListChecks, School, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { AI_OPERATIONS_AREA, HOME_PATH, MY_CLASSES_PATH, USER_AREAS } from "@/lib/navigation";
import { LogoutButton } from "./logout-button";

const LINK = "text-sidebar-foreground no-underline";

export interface AppSidebarProps {
  me: Pick<MeView, "name" | "emailVerified" | "permissions"> | null;
}

/**
 * Side menu of the signed-in screens. "Usuários" groups the administration areas the user may
 * open, "Operação de IA" is the administrator's AI operation (006), "Minhas disciplinas", "Banco de Exercícios" (010), "Banco de Trabalhos" (011) and "Turmas" are the teacher's subjects, exercises, works and classes, and "Minhas
 * turmas" the student's (UX only; the API authorizes). An unverified e-mail sees
 * none: every such route would answer EMAIL_NOT_VERIFIED (FR-016). Collapsed, the menu keeps only
 * the icons (labels stay as accessible names and show as tooltips); opening "Usuários" there
 * expands the menu, since its sub-items have no icon.
 */
export function AppSidebar({ me }: AppSidebarProps) {
  const pathname = usePathname();
  const areas = me?.emailVerified ? USER_AREAS.filter((area) => me.permissions.includes(area.permission)) : [];
  const classes = Boolean(me?.emailVerified && me.permissions.includes("turmas.visualizar"));
  const inClasses = pathname === "/turmas" || pathname.startsWith("/turmas/");
  const ownClasses = Boolean(me?.emailVerified && me.permissions.includes("turmas.proprias.listar"));
  const subjects = Boolean(me?.emailVerified && me.permissions.includes("disciplinas.visualizar"));
  const aiOperations = Boolean(me?.emailVerified && me.permissions.includes(AI_OPERATIONS_AREA.permission));
  const inSubjects = pathname === "/disciplinas" || pathname.startsWith("/disciplinas/");
  const exercises = Boolean(me?.emailVerified && me.permissions.includes("questoes.visualizar"));
  const inExercises = pathname === "/exercicios" || pathname.startsWith("/exercicios/");
  const works = Boolean(me?.emailVerified && me.permissions.includes("trabalhos.visualizar"));
  const inWorks = pathname === "/trabalhos" || pathname.startsWith("/trabalhos/");
  const exams = Boolean(me?.emailVerified && me.permissions.includes("provas.visualizar"));
  const inExams = pathname === "/provas" || pathname.startsWith("/provas/");
  const { state, isMobile, setOpen } = useSidebar();
  const iconsOnly = state === "collapsed" && !isMobile;
  const [usersOpen, setUsersOpen] = useState(true);

  const toggleUsers = (next: boolean) => {
    if (iconsOnly) {
      setOpen(true);
      setUsersOpen(true);
    } else {
      setUsersOpen(next);
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/" className={`${LINK} px-2 py-1 text-h3 font-bold`}>
          <span className="group-data-[collapsible=icon]:sr-only">DevTrack</span>
          <span aria-hidden="true" className="hidden group-data-[collapsible=icon]:inline">
            D
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Menu principal">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {areas.length > 0 ? (
                  <Collapsible
                    asChild
                    open={usersOpen && !iconsOnly}
                    onOpenChange={toggleUsers}
                    className="group/usuarios"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip="Usuários">
                          <Users aria-hidden="true" />
                          <span>Usuários</span>
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
                {aiOperations ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === AI_OPERATIONS_AREA.href} tooltip={AI_OPERATIONS_AREA.label}>
                      <Link
                        href={AI_OPERATIONS_AREA.href}
                        className={LINK}
                        aria-current={pathname === AI_OPERATIONS_AREA.href ? "page" : undefined}
                      >
                        <Activity aria-hidden="true" />
                        <span>{AI_OPERATIONS_AREA.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {subjects ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={inSubjects} tooltip="Minhas disciplinas">
                      <Link
                        href="/disciplinas"
                        className={LINK}
                        aria-current={pathname === "/disciplinas" ? "page" : undefined}
                      >
                        <Library aria-hidden="true" />
                        <span>Minhas disciplinas</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {exercises ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={inExercises} tooltip="Banco de Exercícios">
                      <Link
                        href="/exercicios"
                        className={LINK}
                        aria-current={pathname === "/exercicios" ? "page" : undefined}
                      >
                        <ListChecks aria-hidden="true" />
                        <span>Banco de Exercícios</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {works ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={inWorks} tooltip="Banco de Trabalhos">
                      <Link
                        href="/trabalhos"
                        className={LINK}
                        aria-current={pathname === "/trabalhos" ? "page" : undefined}
                      >
                        <ClipboardList aria-hidden="true" />
                        <span>Banco de Trabalhos</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {exams ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={inExams} tooltip="Banco de Provas">
                      <Link href="/provas" className={LINK} aria-current={pathname === "/provas" ? "page" : undefined}>
                        <FileCheck2 aria-hidden="true" />
                        <span>Banco de Provas</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {classes ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={inClasses} tooltip="Turmas">
                      <Link href="/turmas" className={LINK} aria-current={pathname === "/turmas" ? "page" : undefined}>
                        <School aria-hidden="true" />
                        <span>Turmas</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {ownClasses ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === MY_CLASSES_PATH} tooltip="Minhas turmas">
                      <Link
                        href={MY_CLASSES_PATH}
                        className={LINK}
                        aria-current={pathname === MY_CLASSES_PATH ? "page" : undefined}
                      >
                        <BookOpen aria-hidden="true" />
                        <span>Minhas turmas</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === HOME_PATH} tooltip="Meu perfil">
                    <Link href={HOME_PATH} className={LINK} aria-current={pathname === HOME_PATH ? "page" : undefined}>
                      <UserRound aria-hidden="true" />
                      <span>Meu perfil</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter>
        {me ? <p className="m-0 truncate px-2 text-body-sm group-data-[collapsible=icon]:sr-only">{me.name}</p> : null}
        <div className="px-2 group-data-[collapsible=icon]:px-0">
          <LogoutButton className="group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:[&>span]:sr-only" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
