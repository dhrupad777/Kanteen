/**
 * Sets kitchen_manager + isOwner custom claims on dhrupadrajpurohit@gmail.com
 * so Google sign-in grants full access to /counter, /kitchen, /report.
 *
 * Run once; claims persist in Firebase Auth permanently.
 *
 * Usage:
 *   node scripts/set-owner-claims.cjs
 */

const admin = require('firebase-admin');
const path = require('path');

const OWNER_EMAIL = 'dhrupadrajpurohit@gmail.com';

try {
    const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (e) {
    console.error('Failed to load firebase-service-account.json:', e.message);
    process.exit(1);
}

async function main() {
    const adminAuth = admin.auth();

    let uid;
    try {
        const user = await adminAuth.getUserByEmail(OWNER_EMAIL);
        uid = user.uid;
        console.log(`Found user: ${OWNER_EMAIL} (uid: ${uid})`);
    } catch (e) {
        if (e?.code === 'auth/user-not-found') {
            console.error(`User ${OWNER_EMAIL} not found in Firebase Auth.`);
            console.error('They need to sign in with Google at least once first.');
        } else {
            console.error('Error looking up user:', e.message);
        }
        process.exit(1);
    }

    await adminAuth.setCustomUserClaims(uid, {
        role: 'kitchen_manager',
        isOwner: true,
    });

    console.log(`✅ Custom claims set on ${OWNER_EMAIL}:`);
    console.log('   role: kitchen_manager');
    console.log('   isOwner: true');
    console.log('');
    console.log('The user must sign out and sign back in (or wait ~1 hour) for the new claims to take effect.');
    process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
