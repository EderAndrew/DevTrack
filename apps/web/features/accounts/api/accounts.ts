import type { AccountPage, UserAccountView, UserListQuery } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

const search = (params: UserListQuery) => {
  const query = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  return query ? `?${query}` : "";
};

/** Identity-level account administration by ADMIN (001/FR-052–FR-056). */
export const accountsApi = {
  list: (params: UserListQuery) => apiClient.get<AccountPage>(`/users${search(params)}`),
  suspend: (id: string) => apiClient.post<UserAccountView>(`/users/${id}/suspend`),
  reactivate: (id: string) => apiClient.post<UserAccountView>(`/users/${id}/reactivate`),
};
