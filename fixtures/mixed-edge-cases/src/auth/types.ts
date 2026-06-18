// Domain types for the new boundary.

export interface Principal {
  userId: string;
  email: string;
  tenantId?: string;
  roles: string[];
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
