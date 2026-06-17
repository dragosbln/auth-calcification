// Bounded: reads the domain Principal. No vendor user object,
// no inline claim access at the call site.

import React from "react";
import { useAuth } from "../auth/context";

export function ProfilePage() {
  const { principal } = useAuth();
  if (!principal) return null;
  return (
    <div>
      <h1>{principal.email}</h1>
      <p>Tenant: {principal.tenantId}</p>
    </div>
  );
}
