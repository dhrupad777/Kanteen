/**
 * Updates Firestore menu_items collection:
 * - Replaces daily_menu items with: Full plate (₹75), Half plate (₹35), Sabji rice (₹50) — each with parcelCharge:5
 * - Adds/upserts daily_regulars: Roti, Sabji, Half Rice, Full Rice, Papad, Sweet, Salad
 *
 * Usage: node scripts/update-menu-items.cjs
 * Requires: firebase-service-account.json in project root
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../firebase-service-account.json');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ firebase-service-account.json not found in project root.');
    process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DAILY_MENU_ITEMS = [
    { name: 'Full plate',  price: 75, parcelCharge: 5, sortOrder: 100 },
    { name: 'Half plate',  price: 35, parcelCharge: 5, sortOrder: 101 },
    { name: 'Sabji rice',  price: 50, parcelCharge: 5, sortOrder: 102 },
];

const DAILY_REGULARS_ITEMS = [
    { name: 'Roti',       price: 5,  sortOrder: 200 },
    { name: 'Sabji',      price: 25, sortOrder: 201 },
    { name: 'Half Rice',  price: 25, sortOrder: 202 },
    { name: 'Full Rice',  price: 50, sortOrder: 203 },
    { name: 'Papad',      price: 5,  sortOrder: 210 },
    { name: 'Sweet',      price: 10, sortOrder: 211 },
    { name: 'Salad',      price: 10, sortOrder: 212 },
];

async function run() {
    const col = db.collection('menu_items');

    // ── Step 1: Delete all existing daily_menu items ──────────────────────
    const existingDailyMenu = await col.where('category', '==', 'daily_menu').get();
    if (!existingDailyMenu.empty) {
        const batch = db.batch();
        existingDailyMenu.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`🗑  Deleted ${existingDailyMenu.size} old daily_menu items`);
    }

    // ── Step 2: Add new daily_menu items ─────────────────────────────────
    const batch1 = db.batch();
    for (const item of DAILY_MENU_ITEMS) {
        const ref = col.doc();
        batch1.set(ref, {
            name: item.name,
            price: item.price,
            parcelCharge: item.parcelCharge,
            category: 'daily_menu',
            isActive: true,
            isAvailable: true,
            sortOrder: item.sortOrder,
            tags: ['veg'],
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    await batch1.commit();
    console.log(`✅ Added ${DAILY_MENU_ITEMS.length} daily_menu items`);

    // ── Step 3: Upsert daily_regulars items ───────────────────────────────
    // Check existing by name to avoid duplicates
    const existingRegulars = await col.where('category', '==', 'daily_regulars').get();
    const existingNames = new Map();
    existingRegulars.forEach(doc => existingNames.set(doc.data().name, doc.id));

    const batch2 = db.batch();
    let upserted = 0;
    for (const item of DAILY_REGULARS_ITEMS) {
        const existingId = existingNames.get(item.name);
        const ref = existingId ? col.doc(existingId) : col.doc();
        batch2.set(ref, {
            name: item.name,
            price: item.price,
            category: 'daily_regulars',
            isActive: true,
            isAvailable: true,
            sortOrder: item.sortOrder,
            tags: ['veg'],
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        upserted++;
    }
    await batch2.commit();
    console.log(`✅ Upserted ${upserted} daily_regulars items`);

    console.log('\n🎉 Done! Verify in Firebase Console → Firestore → menu_items');
    process.exit(0);
}

run().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
