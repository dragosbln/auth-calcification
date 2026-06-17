// Inherited refresh + ID token for API auth.
// - Bare fetchAuthSession() with no single-flight, no failure path, no 401 retry.
// - ID token used in Authorization header (Cognito anti-pattern; should be access token).
// - Direct vendor import in the api layer (not injected).

import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';

export const apiClient = axios.create({
  baseURL: 'https://api.example.com',
});

apiClient.interceptors.request.use(async (config) => {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (idToken) {
    config.headers.Authorization = `Bearer ${idToken}`;
  }
  return config;
});
