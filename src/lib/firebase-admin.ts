import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    // In production (Firebase Hosting/Functions), we should rely on Automatic Default Credentials (ADC)
    // or the FIREBASE_CONFIG env var.
    // We only try to load the local file in development.
    if (process.env.NODE_ENV === 'development') {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const serviceAccount = require('../../firebase-service-account.json');
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } catch (error) {
            // Fallback for dev if file missing
            console.warn('Development: Service account file missing, trying default credentials...');
            admin.initializeApp();
        }
    } else {
        // Production
        try {
            admin.initializeApp();
        } catch (error) {
            console.error('Firebase Admin Init Error:', error);
        }
    }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
