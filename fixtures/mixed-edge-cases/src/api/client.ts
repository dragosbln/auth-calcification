// New API client — uses the boundary via injection (clean).
// The legacy code in src/legacy/ does NOT go through this client.

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
