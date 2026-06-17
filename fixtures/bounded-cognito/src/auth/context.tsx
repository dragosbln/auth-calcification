// React context injecting an AuthPort. Components use useAuth(); they never
// import a vendor or know which adapter is active.

import React, { createContext, useContext, useEffect, useState } from "react";
import type { AuthPort } from "./port";
import type { Principal } from "./types";

const AuthContext = createContext<{
  auth: AuthPort;
  principal: Principal | null;
} | null>(null);

export function AuthProvider({
  auth,
  children,
}: {
  auth: AuthPort;
  children: React.ReactNode;
}) {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  useEffect(() => {
    auth.getPrincipal().then(setPrincipal);
  }, [auth]);
  return (
    <AuthContext.Provider value={{ auth, principal }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth used outside AuthProvider");
  return ctx;
}
