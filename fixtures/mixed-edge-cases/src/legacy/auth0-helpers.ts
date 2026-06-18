// LEGACY: leaky Auth0 facade. The codebase is mid-migration from Auth0 to
// Cognito, and this old code hasn't been ported yet. Returns Auth0's User
// type directly — vendor shape passes through to every caller.

import { createAuth0Client, type User, type Auth0Client } from "@auth0/auth0-spa-js";

let client: Auth0Client | null = null;

export async function getAuth0Client(): Promise<Auth0Client> {
  if (!client) {
    client = await createAuth0Client({
      domain: "legacy-tenant.auth0.com",
      clientId: "legacy-client-id",
    });
  }
  return client;
}

// Returns Auth0's User type — leaky facade. Every caller now depends on
// the vendor's User shape.
export async function getLegacyUser(): Promise<User | undefined> {
  const c = await getAuth0Client();
  return c.getUser();
}

// Direct Auth0 token call — no boundary, no single-flight, inherited refresh.
export async function getLegacyToken(): Promise<string> {
  const c = await getAuth0Client();
  // Missing `audience` — opaque token, not a real JWT (the Auth0 anti-pattern
  // the profile flags). API auth via this is broken-by-design.
  return c.getTokenSilently();
}
