// Domain types — the vocabulary the app speaks.
// Vendor types live behind the AuthPort and never appear in app code.

export interface Principal {
  userId: string;
  email: string;
  tenantId?: string;
  roles: string[];
}

export interface Session {
  principal: Principal;
  accessToken: string;
  expiresAt: number;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public code: "unauthenticated" | "refresh-failed" | "session-expired",
  ) {
    super(message);
    this.name = "AuthError";
  }
}
