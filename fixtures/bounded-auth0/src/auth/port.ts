// The boundary. Every method returns a domain type or void.
// No vendor shape ever crosses this interface.

import type { Principal } from "./types";

export interface AuthPort {
  getAuthHeaders(): Promise<Record<string, string>>;
  getPrincipal(): Promise<Principal | null>;
  onRefresh(): Promise<boolean>;
  onSessionExpired(): void;
  signOut(): Promise<void>;
}
