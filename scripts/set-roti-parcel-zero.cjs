/**
 * Sets parcelCharge = 0 on menu_items whose name matches the zero-parcel list.
 * Safe to re-run — idempotent.
 *
 * Usage: node scripts/set-roti-parcel-zero.cjs
 * Requires: firebase-service-account.json in project root
 */

const ZERO_PARCEL_NAMES = [
    'roti',
    'extra roti',
    'pav',
    'bread',
    'chaas',
    'dahi',
    'bournvita',
    'doodh',
    'lassi',
];

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../firebase-service-account.json');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('firebase-service-account.json not found in project root.');
    process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function run() {
    const snapshot = await db.collection('menu_items').get();
    const batch = db.batch();
    let count = 0;

    snapshot.forEach(doc => {
        const data = doc.data();
        const name = (data.name || '').trim().toLowerCase();
        if (ZERO_PARCEL_NAMES.includes(name) && data.parcelCharge !== 0) {
            batch.update(doc.ref, { parcelCharge: 0 });
            count++;
            console.log(`Updating ${doc.id} (${data.name}) parcelCharge: ${data.parcelCharge} → 0`);
        }
    });

    if (count === 0) {
        console.log('No matching items needed updating.');
        return;
    }

    await batch.commit();
    console.log(`✓ Updated ${count} Roti item(s).`);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
