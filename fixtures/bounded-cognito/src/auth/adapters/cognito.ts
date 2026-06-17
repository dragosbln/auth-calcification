// The ONLY file in the app that imports aws-amplify. Vendor types,
// vendor claim names, and the vendor's storage seam are confined here.
// To swap providers, write one sibling adapter file. To swap storage, swap
// the MemoryKeyValueStorage implementation. Both changes are local.

import { fetchAuthSession, signOut } from "aws-amplify/auth";
import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito";
import type { KeyValueStorageInterface } from "aws-amplify/utils";
import type { AuthPort } from "../port";
import { AuthError, type Principal } from "../types";
import { refreshOnce } from "../refresh";

// Custom storage adapter: the swappability signal. In a real app this would
// be an HttpOnly-cookie-backed implementation or similar; in-memory is enough
// for the fixture to show the seam is taken.
class MemoryKeyValueStorage implements KeyValueStorageInterface {
  private store = new Map<string, string>();
  async setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  async getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  async removeItem(key: string) {
    this.store.delete(key);
  }
  async clear() {
    this.store.clear();
  }
}

cognitoUserPoolsTokenProvider.setKeyValueStorage(new MemoryKeyValueStorage());

// Claim mapping — vendor claim names appear ONLY here. The rest of the app
// sees a domain Principal with roles, never `cognito:groups`.
export class CognitoAuthAdapter implements AuthPort {
  constructor(private onExpired: () => void = () => {}) {}

  async getAuthHeaders(): Promise<Record<string, string>> {
    const session = await fetchAuthSession();
    // Access token, not ID token — Axis 4 (token type) bounded.
    const accessToken = session.tokens?.accessToken?.toString();
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  }

  async getPrincipal(): Promise<Principal | null> {
    const session = await fetchAuthSession();
    const idPayload = session.tokens?.idToken?.payload;
    if (!idPayload) return null;
    return {
      userId: String(idPayload.sub ?? ""),
      email: String(idPayload.email ?? ""),
      tenantId: idPayload["custom:tenantId"] as string | undefined,
      roles: (idPayload["cognito:groups"] as string[] | undefined) ?? [],
    };
  }

  async onRefresh(): Promise<boolean> {
    return refreshOnce(async () => {
      try {
        const session = await fetchAuthSession({ forceRefresh: true });
        return !!session.tokens?.accessToken;
      } catch {
        return false;
      }
    });
  }

  onSessionExpired(): void {
    this.onExpired();
    throw new AuthError("session expired", "session-expired");
  }

  async signOut(): Promise<void> {
    await signOut();
  }
}
