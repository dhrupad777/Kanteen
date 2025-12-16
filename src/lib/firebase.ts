import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDXkt7jhkENyEejYbKFZNQzuX4uyru269I",
  authDomain: "kanteen-gm6uq.firebaseapp.com",
  projectId: "kanteen-gm6uq",
  storageBucket: "kanteen-gm6uq.appspot.com", // IMPORTANT: appspot.com
  messagingSenderId: "190244278779",
  appId: "1:190244278779:web:db66a2136dcae7db45bb5e",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Analytics must NEVER run during SSR/build
export async function getClientAnalytics() {
  if (typeof window === "undefined") return null;
  const { getAnalytics } = await import("firebase/analytics");
  return getAnalytics(app);
}
