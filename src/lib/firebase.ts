
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDXkt7jhkENyEejYbKFZNQzuX4uyru269I",
  authDomain: "kanteen-gm6uq.firebaseapp.com",
  projectId: "kanteen-gm6uq",
  storageBucket: "kanteen-gm6uq.firebasestorage.app",
  messagingSenderId: "190244278779",
  appId: "1:190244278779:web:db66a2136dcae7db45bb5e",
  measurementId: "G-9FCB95HMZ5"
};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);
// const analytics = getAnalytics(app);


export { app, db, auth };
