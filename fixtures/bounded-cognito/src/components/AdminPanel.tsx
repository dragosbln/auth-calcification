// Bounded: asks the policy, not the claim. No hard-coded role strings,
// no inline claim reads, no vendor import.

import React from "react";
import { useAuth } from "../auth/context";
import { can } from "../auth/policy";

export function AdminPanel() {
  const { principal } = useAuth();
  if (!can(principal, "admin.view")) return null;
  return <div>Admin controls</div>;
}
