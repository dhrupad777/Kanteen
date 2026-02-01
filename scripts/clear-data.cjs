/**
 * Clear orders and reset daily state
 *
 * Usage:
 *   node scripts/clear-data.cjs              # Clear all orders
 *   node scripts/clear-data.cjs --dry-run    # Preview what would be deleted
 *   node scripts/clear-data.cjs --orders-only # Only clear orders collection
 */

const admin = require('firebase-admin');
const path = require('path');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const ordersOnly = args.includes('--orders-only');

// Initialize Firebase Admin
try {
    const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');
    const serviceAccount = require(serviceAccountPath);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin initialized');
} catch (error) {
    console.error('❌ Failed to initialize Firebase Admin');
    console.error('   Make sure firebase-service-account.json exists in the project root');
    console.error('   Download from: Firebase Console > Project Settings > Service Accounts');
    process.exit(1);
}

const db = admin.firestore();

async function deleteCollection(collectionPath, label) {
    console.log(`\n📋 ${label}:`);
    const collectionRef = db.collection(collectionPath);
    const snapshot = await collectionRef.get();

    if (snapshot.empty) {
        console.log(`   (empty)`);
        return 0;
    }

    console.log(`   Found ${snapshot.size} documents`);

    if (dryRun) {
        snapshot.docs.slice(0, 5).forEach(doc => {
            const data = doc.data();
            console.log(`   - ${doc.id} (token: ${data.token || 'N/A'}, status: ${data.status || 'N/A'})`);
        });
        if (snapshot.size > 5) {
            console.log(`   ... and ${snapshot.size - 5} more`);
        }
        return snapshot.size;
    }

    // Delete in batches
    const batchSize = 100;
    let deleted = 0;

    while (true) {
        const batch = db.batch();
        const docs = await collectionRef.limit(batchSize).get();

        if (docs.empty) break;

        docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deleted += docs.size;
        console.log(`   Deleted ${deleted}/${snapshot.size}...`);
    }

    return deleted;
}

async function clearCanteenState() {
    console.log(`\n📋 canteen_state/today:`);
    const docRef = db.collection('canteen_state').doc('today');
    const doc = await docRef.get();

    if (!doc.exists) {
        console.log(`   (does not exist)`);
        return;
    }

    const data = doc.data();
    console.log(`   nextOnlineToken: ${data.nextOnlineToken || 'N/A'}`);
    console.log(`   nextOfflineToken: ${data.nextOfflineToken || 'N/A'}`);
    console.log(`   dayKey: ${data.dayKey || 'N/A'}`);

    if (dryRun) {
        console.log(`   Would reset to: nextOnlineToken=201, nextOfflineToken=1`);
        return;
    }

    // Reset the counters
    await docRef.set({
        nextOnlineToken: 201,
        nextOfflineToken: 1,
        dayKey: new Date().toISOString().split('T')[0],
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`   ✅ Reset counters`);
}

async function main() {
    console.log('═'.repeat(60));
    console.log(dryRun ? '🔍 DRY RUN - No changes will be made' : '⚠️  LIVE MODE - Data will be deleted');
    console.log('═'.repeat(60));

    // Clear orders
    await deleteCollection('orders', 'Orders');

    if (!ordersOnly) {
        // Clear order_counters (legacy)
        await deleteCollection('order_counters', 'Order Counters (legacy)');

        // Clear/reset canteen_state
        await clearCanteenState();

        // Clear daily_reports
        await deleteCollection('daily_reports', 'Daily Reports');
    }

    console.log('\n' + '═'.repeat(60));
    if (dryRun) {
        console.log('✅ Dry run complete. Run without --dry-run to execute.');
    } else {
        console.log('✅ Cleanup complete!');
    }
    console.log('═'.repeat(60));
}

main().catch(console.error).finally(() => process.exit(0));
