import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, OAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export const ADMIN_EMAIL = "mjfernandez@tsu.edu.ph";

// Microsoft Azure AD app registration
// NOTE: user only provided a tenant id; replace clientId with your actual
// Application (client) ID from Azure Portal if different.
export const MS_TENANT_ID = "common";
export const MS_CLIENT_ID = "a5ec38cc-20b3-4c56-b87b-88a2359d2285";

const firebaseConfig = {
  apiKey: "AIzaSyC9kESJ8bX2RyJbspRf6aJ3MGl-Lp8JT4k",
  authDomain: "scheduling-system-a0cf9.firebaseapp.com",
  projectId: "scheduling-system-a0cf9",
  storageBucket: "scheduling-system-a0cf9.firebasestorage.app",
  messagingSenderId: "111269461691",
  appId: "1:111269461691:web:9e8a4bf4536dc63c88f39e",
  measurementId: "G-V1HVM210X2",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

export function microsoftProvider() {
  const provider = new OAuthProvider("microsoft.com");
  provider.setCustomParameters({
    tenant: MS_TENANT_ID,
    prompt: "select_account",
  });
  provider.addScope("user.read");
  provider.addScope("email");
  return provider;
}