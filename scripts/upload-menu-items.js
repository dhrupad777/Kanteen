/**
 * Script to upload menu items from data.json to Firestore
 * 
 * Usage:
 *   1. Download your Firebase service account key from Firebase Console
 *   2. Save it as firebase-service-account.json in the project root
 *   3. Run: node scripts/upload-menu-items.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ⚠️ IMPORTANT: Update this path to your Firebase service account key
// Download from: Firebase Console → Project Settings → Service Accounts → Generate New Private Key
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../firebase-service-account.json');

// Path to menu data
const DATA_PATH = path.join(__dirname, '../data.json');

async function uploadMenuItems() {
    // Check if service account exists
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        console.error(`
❌ Service account key not found at: ${SERVICE_ACCOUNT_PATH}

To fix this:
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Save the file as "firebase-service-account.json" in the project root
4. Run this script again
`);
        process.exit(1);
    }

    // Initialize Firebase Admin
    const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });

    const db = admin.firestore();

    // Read menu data
    const menuData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    const documents = menuData.documents;

    console.log(`📦 Found ${documents.length} menu items to upload`);
    console.log('');

    // Upload in batches (Firestore limit: 500 writes per batch)
    const BATCH_SIZE = 500;
    let uploadedCount = 0;

    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const batchDocs = documents.slice(i, i + BATCH_SIZE);

        for (const doc of batchDocs) {
            const docRef = db.collection('menu_items').doc(doc.docId);

            // Add updatedAt timestamp
            const data = {
                ...doc.data,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            batch.set(docRef, data, { merge: true });
            uploadedCount++;
        }

        await batch.commit();
        console.log(`✅ Uploaded batch ${Math.floor(i / BATCH_SIZE) + 1} (${batchDocs.length} items)`);
    }

    console.log('');
    console.log('='.repeat(50));
    console.log(`✅ Successfully uploaded ${uploadedCount} menu items`);
    console.log('='.repeat(50));

    // Print category summary
    const categoryCounts = {};
    for (const doc of documents) {
        const cat = doc.data.category;
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }

    console.log('');
    console.log('📊 Items by category:');
    for (const [category, count] of Object.entries(categoryCounts).sort()) {
        console.log(`   ${category}: ${count}`);
    }

    process.exit(0);
}

uploadMenuItems().catch((error) => {
    console.error('❌ Upload failed:', error);
    process.exit(1);
});
