// New boundary contract — only used by the new Cognito side of the codebase.
// The legacy Auth0 code below does not go through this port (yet).

import type { Principal } from "./types";

export interface AuthPort {
  getAuthHeaders(): Promise<Record<string, string>>;
  getPrincipal(): Promise<Principal | null>;
  onRefresh(): Promise<boolean>;
  onSessionExpired(): void;
  signOut(): Promise<void>;
}
