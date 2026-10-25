"use client";

import type { MeView } from "@repo/contracts";
import {
  Activity,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  ChartColumn,
  ChevronRight,
  ClipboardList,
  Cpu,
  FileCheck2,
  GraduationCap,
  HeartPulse,
  Library,
  ListChecks,
  ListTodo,
  type LucideIcon,
  MessagesSquare,
  School,
  SlidersHorizontal,
  UserCog,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  AI_OPERATIONS_AREA,
  AI_OPERATIONS_TABS,
  aiOperationsHref,
  type AiOperationsTab,
  aiOperationsTabOf,
  FEEDBACKS_AREA,
  HOME_PATH,
  MY_CLASSES_PATH,
  USER_AREAS,
} from "@/lib/navigation";
import { useFeedbackSummary } from "@/features/feedback/hooks/use-admin-feedbacks";
import { unreadLabel } from "@/features/feedback/schemas/admin-feedback";
import { BetaBadge } from "./beta-badge";
import { Wordmark, WordmarkInitial } from "./wordmark";
import { LogoutButton } from "./logout-button";

const LINK = "text-sidebar-foreground no-underline";

/** Icon of each sub-item of "Usuários", by its href. */
const USER_AREA_ICONS: Record<(typeof USER_AREAS)[number]["href"], LucideIcon> = {
  "/professores": GraduationCap,
  "/admin/managers": BriefcaseBusiness,
  "/admin/usuarios": UserCog,
};

/** Icon of each section of "Operação de IA". */
const AI_OPERATIONS_ICONS: Record<AiOperationsTab, LucideIcon> = {
  saude: HeartPulse,
  indicadores: ChartColumn,
  orcamentos: Wallet,
  tarefas: ListTodo,
  modelos: Cpu,
  agentes: Bot,
  configuracoes: SlidersHorizontal,
};

export interface AppSidebarProps {
  me: Pick<MeView, "name" | "emailVerified" | "permissions"> | null;
}

/**
 * Side menu of the signed-in screens. "Usuários" groups the administration areas the user may
 * open, "Operação de IA" groups the sections of the administrator's AI operation (006, each a link to its `?aba=`), "Feedbacks" (020) the students' feedbacks with the count still "Recebido" (refetched on focus and after a change, never polled), "Minhas disciplinas", "Banco de Exercícios" (010), "Banco de Trabalhos" (011) and "Turmas" are the teacher's subjects, exercises, works and classes, and "Minhas
 * turmas" the student's (UX only; the API authorizes). An unverified e-mail sees
 * none: every such route would answer EMAIL_NOT_VERIFIED (FR-016). Collapsed, the menu keeps only
 * the icons (labels stay as accessible names and show as tooltips); opening a group there
 * expands the menu, since its sub-items are hidden while collapsed.
 */
export function AppSidebar({ me }: AppSidebarProps) {
  const pathname = usePathname();
  const aiTab = aiOperationsTabOf(useSearchParams()?.get("aba"));
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
  const feedbacks = Boolean(me?.emailVerified && me.permissions.includes(FEEDBACKS_AREA.permission));
  const inFeedbacks = pathname === FEEDBACKS_AREA.href || pathname.startsWith(`${FEEDBACKS_AREA.href}/`);
  const received = useFeedbackSummary(feedbacks).data?.received ?? 0;
  const { state, isMobile, setOpen } = useSidebar();
  const iconsOnly = state === "collapsed" && !isMobile;
  const [usersOpen, setUsersOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(true);

  // Collapsed, a group's sub-items are hidden: the menu expands first.
  const toggleGroup = (setGroupOpen: (open: boolean) => void) => (next: boolean) => {
    if (iconsOnly) {
      setOpen(true);
      setGroupOpen(true);
    } else {
      setGroupOpen(next);
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex-row items-center gap-2">
        <Link href="/" className={`${LINK} px-2 py-1`}>
          <Wordmark className="group-data-[collapsible=icon]:sr-only" />
          <WordmarkInitial className="hidden group-data-[collapsible=icon]:inline" aria-hidden="true" />
        </Link>
        <BetaBadge className="group-data-[collapsible=icon]:hidden" />
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
                    onOpenChange={toggleGroup(setUsersOpen)}
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
                          {areas.map((area) => {
                            const Icon = USER_AREA_ICONS[area.href];
                            return (
                              <SidebarMenuSubItem key={area.href}>
                                <SidebarMenuSubButton asChild isActive={pathname === area.href}>
                                  <Link href={area.href} className={LINK} aria-current={pathname === area.href ? "page" : undefined}>
                                    <Icon aria-hidden="true" />
                                    <span>{area.label}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : null}
                {aiOperations ? (
                  <Collapsible asChild open={aiOpen && !iconsOnly} onOpenChange={toggleGroup(setAiOpen)} className="group/ia">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={AI_OPERATIONS_AREA.label}>
                          <Activity aria-hidden="true" />
                          <span>{AI_OPERATIONS_AREA.label}</span>
                          <ChevronRight
                            aria-hidden="true"
                            className="ml-auto transition-transform group-data-[state=open]/ia:rotate-90"
                          />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {(Object.keys(AI_OPERATIONS_TABS) as AiOperationsTab[]).map((tab) => {
                            const current = pathname === AI_OPERATIONS_AREA.href && aiTab === tab;
                            const Icon = AI_OPERATIONS_ICONS[tab];
                            return (
                              <SidebarMenuSubItem key={tab}>
                                <SidebarMenuSubButton asChild isActive={current}>
                                  <Link
                                    href={aiOperationsHref(tab)}
                                    className={LINK}
                                    aria-current={current ? "page" : undefined}
                                  >
                                    <Icon aria-hidden="true" />
                                    <span>{AI_OPERATIONS_TABS[tab]}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : null}
                {feedbacks ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={inFeedbacks} tooltip={FEEDBACKS_AREA.label}>
                      <Link
                        href={FEEDBACKS_AREA.href}
                        className={LINK}
                        aria-current={pathname === FEEDBACKS_AREA.href ? "page" : undefined}
                      >
                        <MessagesSquare aria-hidden="true" />
                        <span>{FEEDBACKS_AREA.label}</span>
                        {received > 0 ? <span className="sr-only">, {unreadLabel(received)}</span> : null}
                      </Link>
                    </SidebarMenuButton>
                    {received > 0 ? <SidebarMenuBadge aria-hidden="true">{received}</SidebarMenuBadge> : null}
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
