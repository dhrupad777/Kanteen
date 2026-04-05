/**
 * Update staff_credentials/config in Firestore AND sync Firebase Auth passwords.
 * Reads passwords from environment variables — never hardcoded.
 *
 * Usage:
 *   MANAGER_PASSWORD=xxx KITCHEN_PASSWORD=yyy COUNTER_PASSWORD=zzz node scripts/update-staff-credentials.cjs
 *
 * Accounts managed:
 *   manager.mrc@gmail.com  — kitchen_manager (isOwner)
 *   kitchen.mrc@gmail.com  — kitchen_staff
 *   counter.mrc@gmail.com  — kitchen_staff
 */

const admin = require('firebase-admin');
const path = require('path');

const managerPassword = process.env.MANAGER_PASSWORD;
const kitchenPassword = process.env.KITCHEN_PASSWORD;
const counterPassword = process.env.COUNTER_PASSWORD;

if (!managerPassword || !kitchenPassword || !counterPassword) {
    console.error('Error: MANAGER_PASSWORD, KITCHEN_PASSWORD, and COUNTER_PASSWORD env vars are required.');
    console.error('Usage: MANAGER_PASSWORD=xxx KITCHEN_PASSWORD=yyy COUNTER_PASSWORD=zzz node scripts/update-staff-credentials.cjs');
    process.exit(1);
}

try {
    const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (e) {
    console.error('Failed to load firebase-service-account.json:', e.message);
    process.exit(1);
}

const db = admin.firestore();
const auth = admin.auth();

const accounts = [
    { email: 'manager.mrc@gmail.com', password: managerPassword, role: 'kitchen_manager' },
    { email: 'kitchen.mrc@gmail.com', password: kitchenPassword, role: 'kitchen_staff' },
    { email: 'counter.mrc@gmail.com', password: counterPassword, role: 'kitchen_staff' },
];

async function main() {
    // 1. Update Firestore credentials doc (used by /api/auth/staff-login to verify password)
    await db.collection('staff_credentials').doc('config').set({
        accounts,
        updatedAt: new Date().toISOString(),
    });
    console.log('✅ Firestore staff_credentials/config updated');

    // 2. Sync Firebase Auth passwords so signInWithEmailAndPassword works
    for (const a of accounts) {
        try {
            const user = await auth.getUserByEmail(a.email);
            await auth.updateUser(user.uid, { password: a.password });
            console.log(`✅ Firebase Auth password updated: ${a.email}`);
        } catch (e) {
            if (e.code === 'auth/user-not-found') {
                const created = await auth.createUser({ email: a.email, password: a.password });
                await auth.setCustomUserClaims(created.uid, { role: a.role });
                console.log(`✅ Firebase Auth user created: ${a.email} (role: ${a.role})`);
            } else {
                console.error(`❌ Error for ${a.email}:`, e.message);
            }
        }
    }

    console.log('\nAll done. Staff can now log in with the new passwords.');
    process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
