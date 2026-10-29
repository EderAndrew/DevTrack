"use client";

import { ChevronsUpDown, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { HOME_PATH } from "@/lib/navigation";
import { useLeave } from "./logout-button";

export interface NavUserProps {
  name?: string;
  email?: string;
}

/** Up to two initials of the name ("Ana Souza" → "AS"); "?" without a name. */
function initialsOf(name?: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]!.charAt(0);
  const last = words.length > 1 ? words.at(-1)!.charAt(0) : "";
  return `${first}${last}`.toUpperCase();
}

function UserIdentity({ name, email }: NavUserProps) {
  return (
    <>
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-caption font-semibold text-sidebar-primary-foreground"
      >
        {initialsOf(name)}
      </span>
      <span className="grid flex-1 text-left leading-tight">
        <span className="truncate font-semibold">{name ?? "Minha conta"}</span>
        {email ? <span className="truncate text-caption text-text-secondary">{email}</span> : null}
      </span>
    </>
  );
}

/**
 * Footer of the side menu (shadcn "NavUser"): the signed-in user's initials, name and e-mail; a click
 * opens a menu with "Meu perfil" and "Sair". Collapsed, only the initials show (the name as tooltip);
 * on a narrow screen the menu opens above, otherwise beside the side menu.
 */
export function NavUser({ name, email }: NavUserProps) {
  const { isMobile } = useSidebar();
  const { leave, pending } = useLeave();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={name ?? "Minha conta"}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <UserIdentity name={name} email={email} />
              <ChevronsUpDown aria-hidden="true" className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "top" : "right"} align="end" sideOffset={8} className="min-w-56">
            <DropdownMenuLabel className="flex items-center gap-2 text-body-sm text-foreground">
              <UserIdentity name={name} email={email} />
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href={HOME_PATH} className="text-foreground no-underline">
                  <UserRound aria-hidden="true" />
                  Meu perfil
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              aria-busy={pending || undefined}
              onSelect={(event) => {
                event.preventDefault();
                leave();
              }}
            >
              <LogOut aria-hidden="true" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
