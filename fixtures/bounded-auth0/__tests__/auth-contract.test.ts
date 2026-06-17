// The contract every AuthPort adapter must satisfy. Identical assertions to
// the bounded-cognito contract suite — that's the entire point: domain-only,
// vendor-free. The Auth0 adapter passing this suite is what "the boundary
// travels" means in concrete terms.

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
        // Same leak checks as bounded-cognito: vendor claim names must never
        // surface in the Principal, regardless of which adapter produced it.
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

// === Run against the real Auth0 adapter ===
// SDK mocked at the import boundary. Assertions are untouched — same suite
// as bounded-cognito, different adapter. That structural sameness is the
// portability proof.
vi.mock("@auth0/auth0-spa-js", () => ({
  createAuth0Client: vi.fn().mockResolvedValue({
    getUser: vi.fn().mockResolvedValue({
      sub: "u-1",
      email: "fake@example.com",
      "https://example.com/tenantId": "t-1",
      "https://example.com/roles": ["admin"],
    }),
    getAccessTokenSilently: vi.fn().mockResolvedValue("access.jwt.token"),
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}));

runAuthContractTests("Auth0AuthAdapter", async () => {
  const { createAuth0Adapter } = await import("../src/auth/adapters/auth0");
  return createAuth0Adapter({
    domain: "tenant.auth0.com",
    clientId: "test-client",
    audience: "https://api.example.com",
    scope: "openid profile email",
    namespace: "https://example.com/",
  });
});
