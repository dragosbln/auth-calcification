// API client receives the AuthPort by injection, not by importing a vendor.
// 401 → onRefresh (single-flight, inside the adapter) → retry once →
// onSessionExpired if still failing. Owned behavior, explicit failure path.

import type { AuthPort } from "../auth/port";

export function createApiClient(auth: AuthPort) {
  return async function apiFetch<T>(
    url: string,
    init: RequestInit = {},
  ): Promise<T> {
    const call = async () =>
      fetch(url, {
        ...init,
        headers: { ...init.headers, ...(await auth.getAuthHeaders()) },
      });

    let res = await call();
    if (res.status === 401 && (await auth.onRefresh())) {
      res = await call();
    }
    if (res.status === 401) {
      auth.onSessionExpired();
    }
    return res.json() as Promise<T>;
  };
}
