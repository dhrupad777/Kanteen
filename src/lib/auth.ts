import { auth, db } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut as firebaseSignOut, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

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
googleProvider.addScope('email');
googleProvider.addScope('profile');

// Session storage key used to show a "completing sign-in" spinner when
// the user returns from a Google redirect (instead of flashing the login page).
export const REDIRECT_PENDING_KEY = 'googleAuthRedirectPending';

/**
 * Detects in-app browsers (Instagram, Facebook, Snapchat, Telegram, WhatsApp, etc.)
 * where both signInWithPopup AND signInWithRedirect are broken.
 * These browsers must be instructed to open the page in a real browser.
 */
export function isInAppBrowser(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;

    // Explicitly known in-app browser strings
    if (/FBAN|FBAV|Instagram|Snapchat|Line\/|MicroMessenger|Twitter|LinkedInApp|Musical.ly|TikTok/.test(ua)) return true;

    // Android WebView (not Chrome, not Firefox, not Samsung Internet)
    if (/Android/.test(ua) && /wv/.test(ua)) return true;
    // Android stock browser (old): has 'Version/X.X' but no 'Chrome'
    if (/Android/.test(ua) && /Version\/\d/.test(ua) && !/Chrome\//.test(ua)) return true;

    // iOS WebView: on real iOS the UA always contains "Safari" for Safari and
    // "CriOS" / "FxiOS" for Chrome/Firefox. A WebView has neither.
    if (/iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua) && !/CriOS\//.test(ua) && !/FxiOS\//.test(ua)) return true;

    return false;
}

/**
 * iOS PWA (home-screen installed app running in standalone mode).
 * signInWithRedirect navigates OUTSIDE the PWA and breaks the flow.
 * signInWithPopup works on iOS 16.4+ standalone; we try it and let the
 * popup-blocked handler decide what to do if the OS rejects it.
 */
export function isIOSPWA(): boolean {
    if (typeof window === 'undefined') return false;
    return (window.navigator as any).standalone === true;
}

export async function signInWithGoogle() {
    if (BYPASS_AUTH) {
        console.log("🔓 AUTH BYPASS: signInWithGoogle called (bypassed)");
        return MOCK_USER;
    }

    // Strategy:
    // 1. Try signInWithPopup — works on virtually all real browsers when triggered by a user
    //    gesture (tap/click). Avoids the third-party storage partitioning that breaks redirect
    //    on modern Chrome/Safari.
    // 2. If the browser explicitly blocks the popup (auth/popup-blocked), fall back to redirect
    //    and set a sessionStorage flag so the UI can show a spinner on return.
    // 3. In-app browsers and iOS PWA edge cases are handled by the calling UI layer BEFORE
    //    reaching this function.
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
    } catch (error: any) {
        if (error?.code === 'auth/popup-blocked') {
            // Browser blocked the popup → fall back to redirect
            sessionStorage.setItem(REDIRECT_PENDING_KEY, '1');
            await signInWithRedirect(auth, googleProvider);
            return null; // page navigates away
        }
        throw error;
    }
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

