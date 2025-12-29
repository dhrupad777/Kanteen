import * as admin from 'firebase-admin';
import * as path from 'path';

const serviceAccount = require(path.join(process.cwd(), 'firebase-service-account.json'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function deleteCollection(collectionPath: string) {
    const collectionRef = db.collection(collectionPath);
    const query = collectionRef.limit(100);

    return new Promise((resolve, reject) => {
        deleteQueryBatch(query, resolve).catch(reject);
    });
}

async function deleteQueryBatch(query: any, resolve: any) {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
        resolve();
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc: any) => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    process.nextTick(() => {
        deleteQueryBatch(query, resolve);
    });
}

async function clear() {
    console.log('Clearing orders...');
    await deleteCollection('orders');
    console.log('Clearing order_counters...');
    await deleteCollection('order_counters');
    console.log('Database cleared successfully!');
}

clear().catch(console.error);
