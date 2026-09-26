import admin from "firebase-admin";

// Initialize the Firebase Admin SDK exactly once.
//
// Two supported credential modes (see backend/.env.example):
//   1. GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account JSON file (local dev)
//   2. FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY env vars (Cloud Run/CI)
//
// If neither is present, admin.initializeApp() falls back to Application Default
// Credentials, which works automatically when deployed on Cloud Run / GCP.
if (!admin.apps.length) {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        // Cloud secrets often escape newlines; restore them.
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  } else {
    admin.initializeApp();
  }
}

export const auth = admin.auth();
export const db = admin.firestore();
export default admin;
