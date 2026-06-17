// The ONLY file in the app that imports @auth0/auth0-spa-js. Vendor types
// (Auth0Client, ICache), namespaced-claim URL keys, and Auth0-specific knobs
// (audience, scope, useRefreshTokens) stay inside this file. App code never
// knows the provider is Auth0.
//
// To swap providers, write one sibling adapter file passing the same contract
// suite. To swap storage, swap the MemoryCache implementation. Both changes
// are local.

import {
  createAuth0Client,
  type Auth0Client,
  type ICache,
} from "@auth0/auth0-spa-js";
import type { AuthPort } from "../port";
import { AuthError, type Principal } from "../types";
import { refreshOnce } from "../refresh";

// Custom ICache: the swappability signal — Auth0's real storage seam.
// NOT `cacheLocation` (that's a built-in selector). In a real app this would
// be an HttpOnly-cookie-backed or encrypted-store implementation; in-memory
// is enough for the fixture to show the seam is taken.
class MemoryCache implements ICache {
  private store = new Map<string, unknown>();
  get<T>(key: string) {
    return this.store.get(key) as T | undefined;
  }
  set<T>(key: string, entry: T) {
    this.store.set(key, entry as unknown);
  }
  remove(key: string) {
    this.store.delete(key);
  }
  allKeys() {
    return [...this.store.keys()];
  }
}

export interface Auth0AdapterOptions {
  domain: string;
  clientId: string;
  // Required: without `audience`, getAccessTokenSilently returns an opaque
  // (non-JWT) token, which is the documented Auth0 anti-pattern for API auth.
  audience: string;
  scope?: string;
  // Namespaced custom-claim prefix, e.g. "https://example.com/". Auth0 silently
  // drops non-namespaced custom claims, so roles/tenantId arrive under full URL keys.
  namespace: string;
  onExpired?: () => void;
}

// Factory: constructs the SDK client with our custom ICache, then wraps it in
// the adapter. All Auth0-specific configuration lives in this function.
export async function createAuth0Adapter(
  opts: Auth0AdapterOptions,
): Promise<AuthPort> {
  const client = await createAuth0Client({
    domain: opts.domain,
    clientId: opts.clientId,
    authorizationParams: {
      audience: opts.audience,
      scope: opts.scope,
    },
    useRefreshTokens: true,
    cache: new MemoryCache(),
  });
  return new Auth0AuthAdapter(client, opts);
}

class Auth0AuthAdapter implements AuthPort {
  constructor(
    private client: Auth0Client,
    private opts: Auth0AdapterOptions,
  ) {}

  async getAuthHeaders(): Promise<Record<string, string>> {
    try {
      // Access token, not ID token — Axis 4 (token type) bounded.
      const token = await this.client.getAccessTokenSilently({
        authorizationParams: {
          audience: this.opts.audience,
          scope: this.opts.scope,
        },
      });
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }

  async getPrincipal(): Promise<Principal | null> {
    const user = await this.client.getUser();
    if (!user) return null;
    // Namespaced-claim reads happen ONLY here. The rest of the app sees a
    // domain Principal with `roles` / `tenantId`, never the full URL key.
    const ns = this.opts.namespace;
    return {
      userId: String(user.sub ?? ""),
      email: String(user.email ?? ""),
      tenantId: user[`${ns}tenantId`] as string | undefined,
      roles: (user[`${ns}roles`] as string[] | undefined) ?? [],
    };
  }

  async onRefresh(): Promise<boolean> {
    return refreshOnce(async () => {
      try {
        // Bypass the SDK cache to force a token refresh (via refresh token,
        // since useRefreshTokens: true). The single-flight wrapper means N
        // concurrent 401s collapse into one refresh call — owned, not inherited.
        await this.client.getAccessTokenSilently({
          cacheMode: "off",
          authorizationParams: {
            audience: this.opts.audience,
            scope: this.opts.scope,
          },
        });
        return true;
      } catch {
        return false;
      }
    });
  }

  onSessionExpired(): void {
    this.opts.onExpired?.();
    throw new AuthError("session expired", "session-expired");
  }

  async signOut(): Promise<void> {
    await this.client.logout({
      logoutParams: {
        returnTo:
          typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
  }
}
