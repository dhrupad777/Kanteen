import { auth, db } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
}

export async function signOut() {
    return firebaseSignOut(auth);
}

export async function checkManagerAllowlist(email: string): Promise<boolean> {
    if (!email) return false;
    const docRef = doc(db, "manager_allowlist", email.toLowerCase());
    const docSnap = await getDoc(docRef);
    return docSnap.exists() && docSnap.data().enabled === true;
}

export async function checkStudentProfileExists(uid: string): Promise<boolean> {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
}

export async function createStudentProfile(uid: string, data: { name: string; email: string; photoURL?: string }) {
    await setDoc(doc(db, "users", uid), {
        uid,
        ...data,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
    });
}

export async function updateStudentLastLogin(uid: string) {
    await setDoc(doc(db, "users", uid), {
        lastLoginAt: serverTimestamp()
    }, { merge: true });
}

export async function createManagerProfile(uid: string, data: { name: string; email: string }) {
    await setDoc(doc(db, "managers", uid), {
        uid,
        ...data,
        lastLoginAt: serverTimestamp(),
    }, { merge: true });
}
