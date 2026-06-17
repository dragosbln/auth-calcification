// Calcified: direct vendor import in a UI component, returns the vendor's
// AuthSession type, reads cognito:groups inline, hard-codes role strings.
// Trips boundary B1 (vendor type leak), B2 (direct import not injected),
// Axis 3 (cognito-specific surface in app code), Axis 4 (inline claim read +
// hard-coded role).

import React, { useEffect, useState } from "react";
import { fetchAuthSession, AuthSession } from "aws-amplify/auth";

export function UserBadge() {
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    fetchAuthSession().then(setSession);
  }, []);

  const groups =
    (session?.tokens?.idToken?.payload["cognito:groups"] as string[]) ?? [];
  const username = session?.tokens?.idToken?.payload["cognito:username"] as
    | string
    | undefined;
  const isAdmin = groups.includes("admin");

  return (
    <span>
      {username} {isAdmin ? "(admin)" : ""}
    </span>
  );
}

// Exporting a function whose return type is the vendor's AuthSession —
// the leak crosses into every caller's type.
export async function getCurrentSession(): Promise<AuthSession> {
  return fetchAuthSession();
}
