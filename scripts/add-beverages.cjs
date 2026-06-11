/**
 * Adds Chaas (Buttermilk), Doodh, Dahi to the tea_beverage category and
 * renames the existing "Roti" item to "Extra Roti".
 *
 * Idempotent — safe to re-run.
 *
 * Usage: node scripts/add-beverages.cjs
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
const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// New beverage items. parcelCharge:0 + the no-parcel allowlist in
// src/lib/no-parcel-items.ts ensures these never get a packaging fee.
const BEVERAGES = [
    { docId: 'chaas', name: 'Chaas',  price: 15, sortOrder: 30 },
    { docId: 'doodh', name: 'Doodh',  price: 15, sortOrder: 31 },
    { docId: 'dahi',  name: 'Dahi',   price: 20, sortOrder: 32 },
];

async function run() {
    const col = db.collection('menu_items');
    const batch = db.batch();

    for (const item of BEVERAGES) {
        const ref = col.doc(item.docId);
        const existing = await ref.get();
        batch.set(ref, {
            name: item.name,
            price: item.price,
            parcelCharge: 0,
            category: 'tea_beverage',
            priceType: 'fixed',
            isActive: true,
            isAvailable: true,
            sortOrder: item.sortOrder,
            tags: ['veg'],
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`${existing.exists ? 'Updating' : 'Inserting'}: ${item.name} @ Rs.${item.price}`);
    }

    // Rename "Roti" → "Extra Roti"
    const rotiSnap = await col.where('category', '==', 'daily_regulars').get();
    rotiSnap.forEach(doc => {
        const d = doc.data();
        if ((d.name || '').trim().toLowerCase() === 'roti') {
            batch.update(doc.ref, {
                name: 'Extra Roti',
                parcelCharge: 0,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Renaming ${doc.id}: "Roti" → "Extra Roti"`);
        }
    });

    await batch.commit();
    console.log('Done.');
    process.exit(0);
}

run().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
