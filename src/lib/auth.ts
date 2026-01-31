import { auth, db } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, User } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

// ============================================================
// TESTING MODE: Authentication bypass
// Set NEXT_PUBLIC_BYPASS_AUTH=true in .env.local for local testing
// In production, this should NEVER be true
// ============================================================
export const BYPASS_AUTH = process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true';

// CRITICAL: Production safety check
if (BYPASS_AUTH) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error(
            '🚨 CRITICAL SECURITY ERROR: BYPASS_AUTH is enabled in production! ' +
            'This disables ALL authentication. Set NEXT_PUBLIC_BYPASS_AUTH=false immediately.'
        );
    }
    // Prominent warning in development
    console.warn('\n' + '='.repeat(60));
    console.warn('⚠️  WARNING: AUTHENTICATION BYPASS IS ENABLED');
    console.warn('   All authentication checks are disabled.');
    console.warn('   This should NEVER be enabled in production!');
    console.warn('   Set NEXT_PUBLIC_BYPASS_AUTH=false before deploying.');
    console.warn('='.repeat(60) + '\n');
}

// Mock user for testing
const MOCK_USER = {
    uid: "test-user-123",
    email: "test@kanteen.com",
    displayName: "Test User",
    photoURL: null,
    emailVerified: true,
    getIdToken: () => Promise.resolve("mock-token-for-testing"),
} as unknown as User;

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
    if (BYPASS_AUTH) {
        console.log("🔓 AUTH BYPASS: signInWithGoogle called (bypassed)");
        return MOCK_USER;
    }
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
}

export async function signOut() {
    if (BYPASS_AUTH) {
        console.log("🔓 AUTH BYPASS: signOut called (bypassed)");
        return;
    }
    return firebaseSignOut(auth);
}

export async function checkManagerAllowlist(email: string): Promise<boolean> {
    if (BYPASS_AUTH) {
        console.log("🔓 AUTH BYPASS: checkManagerAllowlist returning true");
        return true;
    }
    if (!email) return false;
    const docRef = doc(db, "manager_allowlist", email.toLowerCase());
    const docSnap = await getDoc(docRef);
    return docSnap.exists() && docSnap.data().enabled === true;
}

export async function checkStudentProfileExists(uid: string): Promise<boolean> {
    if (BYPASS_AUTH) {
        return true;
    }
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
}

export async function createStudentProfile(uid: string, data: { name: string; email: string; photoURL?: string }) {
    if (BYPASS_AUTH) {
        console.log("🔓 AUTH BYPASS: createStudentProfile called (bypassed)");
        return;
    }
    await setDoc(doc(db, "users", uid), {
        uid,
        ...data,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
    });
}

export async function updateStudentLastLogin(uid: string) {
    if (BYPASS_AUTH) {
        return;
    }
    await setDoc(doc(db, "users", uid), {
        lastLoginAt: serverTimestamp()
    }, { merge: true });
}

export async function createManagerProfile(uid: string, data: { name: string; email: string }) {
    if (BYPASS_AUTH) {
        console.log("🔓 AUTH BYPASS: createManagerProfile called (bypassed)");
        return;
    }
    await setDoc(doc(db, "managers", uid), {
        uid,
        ...data,
        lastLoginAt: serverTimestamp(),
    }, { merge: true });
}
