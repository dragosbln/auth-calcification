// New Cognito adapter — bounded on most axes BUT trips the LOOK-ALIKE TRAP
// on storage. The skill should NOT credit this as "owned storage" because
// `sessionStorage` from aws-amplify/utils is a built-in SELECTOR, not a custom
// adapter. This is the trap the Cognito profile explicitly warns about.
//
// Everything else here is bounded: vendor types confined, claim mapping
// localized, access token used, refresh ownership in place.

import { fetchAuthSession, signOut } from "aws-amplify/auth";
import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito";
// sessionStorage here is the built-in selector from aws-amplify/utils,
// NOT a user-defined class implementing KeyValueStorageInterface.
import { sessionStorage } from "aws-amplify/utils";
import type { AuthPort } from "../port";
import { AuthError, type Principal } from "../types";

// LOOK-ALIKE TRAP: this is `setKeyValueStorage(<built-in selector>)`.
// A naive auditor sees `setKeyValueStorage(...)` and concludes "owned storage."
// The profile says: passing a built-in (defaultStorage / sessionStorage /
// new CookieStorage()) is a SELECTOR, not a custom adapter. Should be flagged
// as "uses built-in selector, not a custom storage adapter."
cognitoUserPoolsTokenProvider.setKeyValueStorage(sessionStorage);

export class CognitoAuthAdapter implements AuthPort {
  async getAuthHeaders(): Promise<Record<string, string>> {
    const session = await fetchAuthSession();
    // Access token — bounded on Axis 4.
    const accessToken = session.tokens?.accessToken?.toString();
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  }

  async getPrincipal(): Promise<Principal | null> {
    const session = await fetchAuthSession();
    const idPayload = session.tokens?.idToken?.payload;
    if (!idPayload) return null;
    // Claim mapping localized to the adapter — bounded on Axis 3 + 4.
    return {
      userId: String(idPayload.sub ?? ""),
      email: String(idPayload.email ?? ""),
      tenantId: idPayload["custom:tenantId"] as string | undefined,
      roles: (idPayload["cognito:groups"] as string[] | undefined) ?? [],
    };
  }

  async onRefresh(): Promise<boolean> {
    try {
      const session = await fetchAuthSession({ forceRefresh: true });
      return !!session.tokens?.accessToken;
    } catch {
      return false;
    }
  }

  onSessionExpired(): void {
    throw new AuthError("session expired", "session-expired");
  }

  async signOut(): Promise<void> {
    await signOut();
  }
}
