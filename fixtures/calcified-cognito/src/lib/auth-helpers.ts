// "Wrapper" around Amplify auth. Looks like a boundary; isn't.
// It re-exports vendor functions and returns the vendor's AuthSession unchanged.
// This is the LEAKY FACADE the methodology warns about — auditor should flag this
// specifically, not give credit for "having a wrapper."

import { fetchAuthSession, getCurrentUser, signOut, AuthSession, AuthUser } from 'aws-amplify/auth';

export async function getSession(): Promise<AuthSession> {
  // Returns the vendor's session shape directly. Every caller is now coupled
  // to AuthSession / AuthTokens.
  return fetchAuthSession();
}

export async function getUser(): Promise<AuthUser> {
  // Same — vendor's AuthUser leaks straight through.
  return getCurrentUser();
}

export async function logout(): Promise<void> {
  return signOut();
}
