/**
 * Adds Pav (₹5) and Bread (₹3) to the daily_regulars (Extra Items) category.
 * Safe to re-run — upserts only, never deactivates existing items.
 *
 * Usage: node scripts/add-extra-items.cjs
 * Requires: firebase-service-account.json in project root
 */

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

const ITEMS_TO_ADD = [
    { name: 'Pav',   price: 5, parcelCharge: 0, sortOrder: 220 },
    { name: 'Bread', price: 3, parcelCharge: 0, sortOrder: 221 },
];

async function run() {
    const col = db.collection('menu_items');

    const snapshot = await col.where('category', '==', 'daily_regulars').get();
    const existingNames = new Map();
    snapshot.forEach(doc => existingNames.set(doc.data().name.toLowerCase(), doc.id));

    const batch = db.batch();

    for (const item of ITEMS_TO_ADD) {
        const existingId = existingNames.get(item.name.toLowerCase());
        const ref = existingId ? col.doc(existingId) : col.doc();
        batch.set(ref, {
            name: item.name,
            price: item.price,
            parcelCharge: item.parcelCharge,
            category: 'daily_regulars',
            isActive: true,
            isAvailable: true,
            sortOrder: item.sortOrder,
            tags: ['veg'],
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`${existingId ? 'Updating' : 'Inserting'}: ${item.name} @ Rs.${item.price}`);
    }

    await batch.commit();
    console.log('Done! Pav and Bread are now in Extra Items.');
    process.exit(0);
}

run().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
