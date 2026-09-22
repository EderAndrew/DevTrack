import type { AccountPage } from "@repo/contracts";
import { serverGet } from "@/lib/api/server";

/** First page of accounts for the page's first render; null when there is no valid session. */
export function fetchFirstAccountsPage(): Promise<AccountPage | null> {
  return serverGet<AccountPage>("/users");
}
