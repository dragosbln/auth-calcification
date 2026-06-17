// The contract every AuthPort adapter must satisfy. Assertions are on the
// domain shape ONLY — no vendor types, no vendor claim names, no vendor
// imports. A test that mocks `aws-amplify` and asserts on its shape (like
// the calcified-cognito fixture's test) would defeat the entire point of B3.
//
// Migration to a new provider = write a sibling adapter that passes this
// suite. That's what "future-proof" means in concrete terms.

import { describe, it, expect, vi } from "vitest";
import type { AuthPort } from "../src/auth/port";
import { AuthError, type Principal } from "../src/auth/types";

// === FakeAuth ===
// In-memory AuthPort. Lets the contract suite run with no vendor present
// and makes explicit that the test surface is the port, not the vendor.
export class FakeAuth implements AuthPort {
  private expired = false;
  constructor(
    private principal: Principal | null = {
      userId: "u-1",
      email: "fake@example.com",
      tenantId: "t-1",
      roles: ["admin"],
    },
    private token: string | null = "fake-access-token",
    private refreshOk: boolean = true,
  ) {}
  async getAuthHeaders() {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }
  async getPrincipal() {
    return this.expired ? null : this.principal;
  }
  async onRefresh() {
    return this.refreshOk;
  }
  onSessionExpired() {
    this.expired = true;
    this.token = null;
    this.principal = null;
    throw new AuthError("session expired", "session-expired");
  }
  async signOut() {
    this.token = null;
    this.principal = null;
  }
}

// === The contract ===
export function runAuthContractTests(
  name: string,
  makeAdapter: () => AuthPort | Promise<AuthPort>,
) {
  describe(`AuthPort contract — ${name}`, () => {
    it("getAuthHeaders returns a Record<string, string>", async () => {
      const auth = await makeAdapter();
      const headers = await auth.getAuthHeaders();
      expect(typeof headers).toBe("object");
      for (const [k, v] of Object.entries(headers)) {
        expect(typeof k).toBe("string");
        expect(typeof v).toBe("string");
      }
    });

    it("getPrincipal returns a domain Principal or null — no vendor-shaped keys", async () => {
      const auth = await makeAdapter();
      const p = await auth.getPrincipal();
      if (p === null) return;
      expect(typeof p.userId).toBe("string");
      expect(typeof p.email).toBe("string");
      expect(Array.isArray(p.roles)).toBe(true);
      for (const key of Object.keys(p)) {
        // Vendor leak checks: no cognito-prefixed keys, no Auth0-style
        // namespaced URL keys. If either ever appeared in a Principal, the
        // adapter forgot to translate vendor claims into the domain.
        expect(key.startsWith("cognito:")).toBe(false);
        expect(key.includes("://")).toBe(false);
      }
    });

    it("onRefresh resolves to a boolean", async () => {
      const auth = await makeAdapter();
      const ok = await auth.onRefresh();
      expect(typeof ok).toBe("boolean");
    });

    it("onSessionExpired signals end-of-session", async () => {
      const auth = await makeAdapter();
      expect(() => auth.onSessionExpired()).toThrow(AuthError);
    });

    it("signOut resolves", async () => {
      const auth = await makeAdapter();
      await expect(auth.signOut()).resolves.toBeUndefined();
    });
  });
}

// === Run against FakeAuth ===
runAuthContractTests("FakeAuth", () => new FakeAuth());

// === Run against the real Cognito adapter ===
// The vendor SDK is mocked at the import boundary; the assertions above are
// untouched. This is what "swap provider = new adapter passes the contract
// suite" looks like in practice.
vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: vi.fn().mockResolvedValue({
    tokens: {
      accessToken: { toString: () => "access.jwt.token" },
      idToken: {
        toString: () => "id.jwt.token",
        payload: {
          sub: "u-1",
          email: "fake@example.com",
          "custom:tenantId": "t-1",
          "cognito:groups": ["admin"],
        },
      },
    },
  }),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("aws-amplify/auth/cognito", () => ({
  cognitoUserPoolsTokenProvider: { setKeyValueStorage: vi.fn() },
}));

runAuthContractTests("CognitoAuthAdapter", async () => {
  const { CognitoAuthAdapter } = await import("../src/auth/adapters/cognito");
  return new CognitoAuthAdapter();
});
