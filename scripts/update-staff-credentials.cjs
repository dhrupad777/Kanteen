/**
 * Update staff_credentials/config in Firestore.
 * Reads passwords from environment variables — never hardcoded.
 *
 * Usage:
 *   MANAGER_PASSWORD=xxx KITCHEN_PASSWORD=yyy node scripts/update-staff-credentials.cjs
 */

const admin = require('firebase-admin');
const path = require('path');

const managerPassword = process.env.MANAGER_PASSWORD;
const kitchenPassword = process.env.KITCHEN_PASSWORD;

if (!managerPassword || !kitchenPassword) {
    console.error('Error: MANAGER_PASSWORD and KITCHEN_PASSWORD env vars are required.');
    console.error('Usage: MANAGER_PASSWORD=xxx KITCHEN_PASSWORD=yyy node scripts/update-staff-credentials.cjs');
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

async function main() {
    const accounts = [
        { email: 'manager.mrc@gmail.com', password: managerPassword, role: 'kitchen_manager' },
        { email: 'kitchen.mrc@gmail.com', password: kitchenPassword, role: 'kitchen_staff' },
    ];

    await db.collection('staff_credentials').doc('config').set({
        accounts,
        updatedAt: new Date().toISOString(),
    });

    console.log('✅ staff_credentials/config updated:');
    for (const a of accounts) {
        console.log(`   ${a.email} → role: ${a.role}`);
    }
    process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
