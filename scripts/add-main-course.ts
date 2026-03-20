import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Initialize Firebase Admin (adjust path as needed)
const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function addMainCourseItems() {
    const batch = db.batch();
    const items = [
        { name: 'Sabji + 2 Roti', price: 35, category: 'daily_menu', parcelCharge: 5 },
        { name: 'Rice + Daal',    price: 35, category: 'daily_menu', parcelCharge: 5 },
        { name: 'Full Plate',     price: 75, category: 'daily_menu', parcelCharge: 10 },
        { name: 'Extra Roti',     price: 5,  category: 'daily_menu', parcelCharge: 0 },
        { name: 'Extra Sabji',    price: 25, category: 'daily_menu', parcelCharge: 0 },
    ];

    const menuItemsRef = db.collection('menu_items');

    for (const item of items) {
        // Generate a concise uuid using random string (or just use Firestore doc id)
        const newDocRef = menuItemsRef.doc();
        batch.set(newDocRef, {
            ...item,
            id: newDocRef.id,
            isActive: true, // Master switch
            isAvailable: true, // Daily toggle
            sortOrder: 0,
            parcelCharge: item.parcelCharge,
            imageUrl: null,
            tags: [],
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Prepared to insert: ${item.name} under ${item.category} for ₹${item.price}`);
    }

    try {
        await batch.commit();
        console.log('Successfully added Main Course items to menu_items!');
        process.exit(0);
    } catch (e) {
        console.error('Failed to commit batch', e);
        process.exit(1);
    }
}

addMainCourseItems();
