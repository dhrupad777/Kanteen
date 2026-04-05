import * as admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

// Your Firebase project ID
const FIREBASE_PROJECT_ID = 'studio-1083756985-9d2c6';

// Singleton instances
let _app: admin.app.App | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;

/**
 * Get or create the Firebase app instance
 */
function getApp(): admin.app.App {
    if (_app) {
        return _app;
    }

    // Check if default app already exists
    if (admin.apps.length > 0) {
        _app = admin.apps[0]!;
        return _app;
    }

    // Initialize new app
    const projectId = process.env.GCLOUD_PROJECT ||
                      process.env.GOOGLE_CLOUD_PROJECT ||
                      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
                      FIREBASE_PROJECT_ID;

    // If a service account key is provided via env var, use it explicitly.
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountKey) {
        try {
            const credential = admin.credential.cert(JSON.parse(serviceAccountKey));
            _app = admin.initializeApp({ credential, projectId });
            console.log(`Firebase Admin initialized with service account key (project: ${projectId})`);
            return _app;
        } catch (e) {
            console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', e);
        }
    }

    // On Cloud Run / App Hosting, applicationDefault() picks up the attached
    // service account automatically. This works for Firestore, Auth reads/writes,
    // and setCustomUserClaims — everything except createCustomToken (which needs
    // the Service Account Token Creator IAM role on the attached SA).
    _app = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId,
    });
    console.log(`Firebase Admin initialized with ADC (project: ${projectId})`);
    return _app;
}

/**
 * Get Firestore instance
 */
export function getAdminDb(): Firestore {
    if (!_db) {
        const app = getApp();
        _db = getFirestore(app);
    }
    return _db;
}

/**
 * Get Auth instance
 */
export function getAdminAuth(): Auth {
    if (!_auth) {
        const app = getApp();
        _auth = getAuth(app);
    }
    return _auth;
}

// For backward compatibility
export const adminDb = {
    collection: (path: string) => getAdminDb().collection(path),
    doc: (path: string) => getAdminDb().doc(path),
    runTransaction: <T>(fn: (transaction: admin.firestore.Transaction) => Promise<T>) =>
        getAdminDb().runTransaction(fn),
    batch: () => getAdminDb().batch(),
};

export const adminAuth = {
    verifyIdToken: (token: string) => getAdminAuth().verifyIdToken(token),
    getUser: (uid: string) => getAdminAuth().getUser(uid),
};

export const firebaseInitialized = true;

export function getFirebaseAdmin() {
    getApp(); // Ensure initialized
    return admin;
}
