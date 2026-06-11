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
    
    // 1. Fetch all existing daily_menu and daily_regulars to clean up or update
    const snapshot = await menuItemsRef.where('category', 'in', ['daily_menu', 'daily_regulars']).get();
    
    const existing = new Map();
    snapshot.docs.forEach(doc => {
        existing.set(doc.data().name.toLowerCase(), doc);
    });

    const itemsToUpsert = [
        // Main Course (Auto-parcel +5)
        { name: 'Full plate', price: 75, category: 'daily_menu', parcelCharge: 5 },
        { name: 'Half plate', price: 35, category: 'daily_menu', parcelCharge: 5 },
        { name: 'Sabji rice', price: 50, category: 'daily_menu', parcelCharge: 5 },
        
        // Daily Regulars
        { name: 'Roti', price: 5, category: 'daily_regulars', parcelCharge: 0 },
        { name: 'Sabji', price: 25, category: 'daily_regulars', parcelCharge: 0 },
        { name: 'Half Rice', price: 25, category: 'daily_regulars', parcelCharge: 0 },
        { name: 'Full Rice', price: 50, category: 'daily_regulars', parcelCharge: 0 },
        
        // Sides (Dynamic)
        { name: 'Papad', price: 5, category: 'daily_regulars', parcelCharge: 0 },
        { name: 'Sweet', price: 10, category: 'daily_regulars', parcelCharge: 0 },
        { name: 'Salad', price: 10, category: 'daily_regulars', parcelCharge: 0 },
    ];

    const batch = db.batch();

    for (const item of itemsToUpsert) {
        const key = item.name.toLowerCase();
        if (existing.has(key)) {
            // Update existing
            const doc = existing.get(key);
            batch.update(doc.ref, {
                price: item.price,
                category: item.category,
                parcelCharge: item.parcelCharge,
                isActive: true, // Keep it active in catalog
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`Updating ${item.name}`);
        } else {
            // Insert new
            const newDocRef = menuItemsRef.doc();
            batch.set(newDocRef, {
                ...item,
                id: newDocRef.id,
                isActive: true,
                isAvailable: true,
                sortOrder: 0,
                imageUrl: null,
                tags: [],
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`Inserting ${item.name}`);
        }
    }

    // Note: We are explicitly not deleting old items like "Rice + Daal" to preserve existing order history,
    // but they can be marked isActive=false manually if needed or we can do it here.
    // For safety, let's just mark old main course items inactive
    const validNames = new Set(itemsToUpsert.map(i => i.name.toLowerCase()));
    snapshot.docs.forEach(doc => {
        if (!validNames.has(doc.data().name.toLowerCase())) {
             batch.update(doc.ref, { isActive: false });
             console.log(`Deactivating obsolete item: ${doc.data().name}`);
        }
    });

    try {
        await batch.commit();
        console.log('Successfully updated menu items!');
        process.exit(0);
    } catch (e) {
        console.error('Failed to commit batch', e);
        process.exit(1);
    }
}

run();
