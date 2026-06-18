// New component using the boundary. No vendor imports. Reads domain Principal.

import React, { useEffect, useState } from "react";
import type { Principal } from "../auth/types";
import { CognitoAuthAdapter } from "../auth/adapters/cognito";

export function NewProfile() {
  const [principal, setPrincipal] = useState<Principal | null>(null);

  useEffect(() => {
    const auth = new CognitoAuthAdapter();
    auth.getPrincipal().then(setPrincipal);
  }, []);

  if (!principal) return null;
  return (
    <div>
      <h1>{principal.email}</h1>
      <p>Tenant: {principal.tenantId}</p>
    </div>
  );
}
