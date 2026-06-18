// LEGACY: direct Auth0 imports, vendor User type in app code,
// inline namespaced-claim reads, hard-coded role strings. Calcified Auth0 side.

import React, { useEffect, useState } from "react";
import { type User } from "@auth0/auth0-spa-js";
import { getAuth0Client } from "../legacy/auth0-helpers";

export function LegacyAdmin() {
  const [user, setUser] = useState<User | undefined>(undefined);

  useEffect(() => {
    getAuth0Client().then((c) => c.getUser()).then(setUser);
  }, []);

  // Inline namespaced-claim reads — Auth0 silently drops non-namespaced
  // custom claims, so roles arrive under a full URL key.
  const roles = (user?.["https://legacy.example.com/roles"] as string[]) ?? [];
  // Hard-coded role strings scattered in app code.
  const isAdmin = roles.includes("admin") || roles.includes("super-admin");

  if (!isAdmin) return null;
  return <div>Legacy admin controls</div>;
}
