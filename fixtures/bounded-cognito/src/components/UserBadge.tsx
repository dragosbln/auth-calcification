// Bounded: no vendor imports. Reads the domain Principal via useAuth().

import React from "react";
import { useAuth } from "../auth/context";
import { can } from "../auth/policy";

export function UserBadge() {
  const { principal } = useAuth();
  if (!principal) return null;
  return (
    <span>
      {principal.email} {can(principal, "admin.view") ? "(admin)" : ""}
    </span>
  );
}
