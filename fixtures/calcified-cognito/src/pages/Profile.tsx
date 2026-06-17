// Calcified: vendor-specific surface (fetchUserAttributes + custom: attrs)
// reached for directly from page-level code, not localized to an adapter.
// Trips Axis 3 (provider-specific feature usage scattered across app code).

import React, { useEffect, useState } from "react";
import {
  fetchUserAttributes,
  FetchUserAttributesOutput,
} from "aws-amplify/auth";

export function ProfilePage() {
  const [attrs, setAttrs] = useState<FetchUserAttributesOutput | null>(null);

  useEffect(() => {
    fetchUserAttributes().then(setAttrs);
  }, []);

  // Reading Cognito custom attributes inline, with a hard-coded key.
  const tenantId = attrs?.["custom:tenantId"];

  return (
    <div>
      <h1>{attrs?.email}</h1>
      <p>Tenant: {tenantId}</p>
    </div>
  );
}
