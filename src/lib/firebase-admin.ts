import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    try {
        const serviceAccount = require('../../firebase-service-account.json');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (error) {
        console.warn('Firebase Admin init failed (likely missing service account file), trying default credentials');
        admin.initializeApp();
    }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
