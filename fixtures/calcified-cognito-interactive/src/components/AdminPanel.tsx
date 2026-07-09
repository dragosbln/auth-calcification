// Calcified: a second component, in a different file, doing the same
// vendor-claim read inline. The point is the *spread* — auditor should
// flag scattered coupling, not just one occurrence.
// Trips Axis 4 (inline claim/role reads scattered; hard-coded role strings).

import React, { useEffect, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

export function AdminPanel() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    fetchAuthSession().then((session) => {
      const groups =
        (session.tokens?.idToken?.payload["cognito:groups"] as string[]) ?? [];
      // Hard-coded role strings, scattered across components.
      setAllowed(groups.includes("admin") || groups.includes("billing-admin"));
    });
  }, []);

  if (!allowed) return null;
  return <div>Admin controls</div>;
}
