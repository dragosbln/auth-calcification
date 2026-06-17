// One place where authorization decisions happen.
// Domain Principal in, boolean out. No vendor claim names anywhere.

import type { Principal } from "./types";

export type Action = "admin.view" | "billing.manage";

const ROLES: Record<Action, string[]> = {
  "admin.view": ["admin", "billing-admin"],
  "billing.manage": ["billing-admin"],
};

export function can(principal: Principal | null, action: Action): boolean {
  if (!principal) return false;
  return ROLES[action].some((role) => principal.roles.includes(role));
}
