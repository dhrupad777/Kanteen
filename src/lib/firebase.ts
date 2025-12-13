// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD8-YXP-aTCVzUPipIZgzSW_Vy6yeEiogQ",
  authDomain: "kanteen-blr.firebaseapp.com",
  projectId: "kanteen-blr",
  storageBucket: "kanteen-blr.firebasestorage.app",
  messagingSenderId: "325547619001",
  appId: "1:325547619001:web:63bc435b8abf8c5a042168",
  measurementId: "G-459CHSXHH3"
};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);
// const analytics = getAnalytics(app);


export { app, db, auth };
