"use client";

import type { InvitationListResponse, InvitationStatus, InvitationView, ManagerListResponse, ManagerView } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { managersApi } from "../api/managers";

export const managersKeys = {
  all: ["managers"] as const,
  list: () => [...managersKeys.all, "list"] as const,
  invitations: (status?: InvitationStatus) =>
    status ? ([...managersKeys.all, "invitations", status] as const) : ([...managersKeys.all, "invitations"] as const),
};

export const useManagers = (initialData: ManagerListResponse) =>
  useQuery({ queryKey: managersKeys.list(), queryFn: managersApi.list, initialData });

export const useManagerInvitations = (initialData: InvitationListResponse) =>
  useQuery({ queryKey: managersKeys.invitations(), queryFn: managersApi.invitations, initialData });

/**
 * Every action writes the entity the API returned into the cached list (002 S10) and marks the
 * affected lists stale; as on the Phase 001 screen, no extra request is made right away.
 */
function useCacheWriters() {
  const queryClient = useQueryClient();
  const invitation = (updated: InvitationView, { prepend = false } = {}) => {
    queryClient.setQueryData<InvitationListResponse>(managersKeys.invitations(), (page) =>
      page
        ? { items: prepend ? [updated, ...page.items] : page.items.map((item) => (item.id === updated.id ? updated : item)) }
        : page,
    );
    return queryClient.invalidateQueries({ queryKey: managersKeys.invitations(), refetchType: "none" });
  };
  const manager = (updated: ManagerView) => {
    queryClient.setQueryData<ManagerListResponse>(managersKeys.list(), (page) =>
      page ? { items: page.items.map((item) => (item.userId === updated.userId ? updated : item)) } : page,
    );
    return queryClient.invalidateQueries({ queryKey: managersKeys.list(), refetchType: "none" });
  };
  return { invitation, manager };
}

export function useInviteManager() {
  const write = useCacheWriters();
  return useMutation({ mutationFn: managersApi.invite, onSuccess: (created) => write.invitation(created, { prepend: true }) });
}

export function useResendManagerInvitation() {
  const write = useCacheWriters();
  return useMutation({ mutationFn: managersApi.resendInvitation, onSuccess: (updated) => write.invitation(updated) });
}

export function useRevokeManagerInvitation() {
  const write = useCacheWriters();
  return useMutation({ mutationFn: managersApi.revokeInvitation, onSuccess: (updated) => write.invitation(updated) });
}

/** Deactivates an ACTIVE/SUSPENDED manager or reactivates an INACTIVE one. */
export function useToggleManager() {
  const write = useCacheWriters();
  return useMutation({
    mutationFn: (manager: ManagerView) =>
      manager.status === "INACTIVE" ? managersApi.reactivate(manager.userId) : managersApi.deactivate(manager.userId),
    onSuccess: (updated) => write.manager(updated),
  });
}
