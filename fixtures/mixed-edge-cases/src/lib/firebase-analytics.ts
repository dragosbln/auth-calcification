// Firebase used here — but no profile exists in vendors/. The skill should
// detect Firebase in package.json + imports, declare it as a COVERAGE GAP
// (vendor detected, no profile available), and continue analyzing what it can.
//
// Note: Firebase here is for analytics, not auth — but the skill can't know
// that until a profile exists. The honest behavior is "I can't assess this
// safely without a profile."

import { initializeApp } from "firebase/app";
import { getAnalytics, logEvent } from "firebase/analytics";

const firebaseApp = initializeApp({
  apiKey: "fake-key",
  authDomain: "fake.firebaseapp.com",
  projectId: "fake-project",
});

const analytics = getAnalytics(firebaseApp);

export function trackLogin(method: string) {
  logEvent(analytics, "login", { method });
}
