import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function run() {
    const menuItemsRef = db.collection('menu_items');

    // Fetch existing daily_regulars to check for duplicates
    const snapshot = await menuItemsRef.where('category', '==', 'daily_regulars').get();

    const existing = new Map<string, admin.firestore.QueryDocumentSnapshot>();
    snapshot.docs.forEach(doc => {
        existing.set(doc.data().name.toLowerCase(), doc);
    });

    const itemsToUpsert = [
        { name: 'Pav',   price: 5, category: 'daily_regulars', parcelCharge: 0 },
        { name: 'Bread', price: 3, category: 'daily_regulars', parcelCharge: 0 },
    ];

    const batch = db.batch();

    for (const item of itemsToUpsert) {
        const key = item.name.toLowerCase();
        if (existing.has(key)) {
            const doc = existing.get(key)!;
            batch.update(doc.ref, {
                price: item.price,
                parcelCharge: item.parcelCharge,
                isActive: true,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Updating: ${item.name}`);
        } else {
            const newDocRef = menuItemsRef.doc();
            batch.set(newDocRef, {
                ...item,
                id: newDocRef.id,
                isActive: true,
                isAvailable: true,
                sortOrder: 100,
                imageUrl: null,
                tags: [],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Inserting: ${item.name}`);
        }
    }

    try {
        await batch.commit();
        console.log('Done! Pav and Bread added to Extra Items.');
        process.exit(0);
    } catch (e) {
        console.error('Batch commit failed:', e);
        process.exit(1);
    }
}

run();
