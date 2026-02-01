/**
 * Cleanup stuck/test orders from Firestore
 *
 * Usage:
 *   node scripts/cleanup-stuck-orders.cjs [--dry-run] [--order-id=xxx]
 *
 * Options:
 *   --dry-run     Show what would be deleted without actually deleting
 *   --order-id    Delete a specific order by ID
 *   --token       Delete orders by token number (e.g., --token=201,202)
 *   --status      Delete orders by status (e.g., --status=pending,Preparing)
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS or firebase-service-account.json
 */

const admin = require('firebase-admin');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const orderIdArg = args.find(a => a.startsWith('--order-id='));
const tokenArg = args.find(a => a.startsWith('--token='));
const statusArg = args.find(a => a.startsWith('--status='));

const specificOrderId = orderIdArg ? orderIdArg.split('=')[1] : null;
const tokens = tokenArg ? tokenArg.split('=')[1].split(',').map(Number) : null;
const statuses = statusArg ? statusArg.split('=')[1].split(',') : null;

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
    console.error('   Download it from Firebase Console > Project Settings > Service Accounts');
    process.exit(1);
}

const db = admin.firestore();

async function main() {
    console.log('\n🔍 Finding orders to clean up...\n');
    console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (will delete orders)'}\n`);

    let query = db.collection('orders');

    // Build query based on arguments
    if (specificOrderId) {
        console.log(`Looking for specific order: ${specificOrderId}`);
        const doc = await db.collection('orders').doc(specificOrderId).get();
        if (!doc.exists) {
            console.log('❌ Order not found');
            process.exit(1);
        }
        const orders = [{ id: doc.id, ...doc.data() }];
        await processOrders(orders);
        return;
    }

    // Get all orders and filter
    const snapshot = await query.get();
    let orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    console.log(`Total orders in database: ${orders.length}`);

    // Filter by tokens if specified
    if (tokens) {
        orders = orders.filter(o => tokens.includes(o.token));
        console.log(`Filtered by tokens [${tokens.join(', ')}]: ${orders.length} orders`);
    }

    // Filter by status if specified
    if (statuses) {
        orders = orders.filter(o => statuses.includes(o.status));
        console.log(`Filtered by status [${statuses.join(', ')}]: ${orders.length} orders`);
    }

    // If no filters, show interactive list
    if (!tokens && !statuses) {
        console.log('\n📋 Recent orders (showing last 20):');
        console.log('─'.repeat(80));

        const recentOrders = orders
            .sort((a, b) => {
                const aTime = a.createdAt?.toDate?.() || new Date(0);
                const bTime = b.createdAt?.toDate?.() || new Date(0);
                return bTime - aTime;
            })
            .slice(0, 20);

        recentOrders.forEach(order => {
            const createdAt = order.createdAt?.toDate?.()?.toLocaleString() || 'Unknown';
            console.log(`Token: ${order.token || 'N/A'} | Status: ${order.status} | User: ${order.userEmail || order.studentId} | Created: ${createdAt}`);
            console.log(`  ID: ${order.id}`);
        });

        console.log('─'.repeat(80));
        console.log('\nTo delete specific orders, use:');
        console.log('  node scripts/cleanup-stuck-orders.cjs --token=201,202');
        console.log('  node scripts/cleanup-stuck-orders.cjs --order-id=<order-id>');
        console.log('  node scripts/cleanup-stuck-orders.cjs --status=pending');
        console.log('\nAdd --dry-run to preview without deleting');
        return;
    }

    await processOrders(orders);
}

async function processOrders(orders) {
    if (orders.length === 0) {
        console.log('No orders match the criteria');
        return;
    }

    console.log(`\n⚠️  Will delete ${orders.length} order(s):\n`);
    orders.forEach(order => {
        console.log(`  - Token ${order.token || 'N/A'} (${order.status}) - ${order.userEmail || order.studentId}`);
        console.log(`    ID: ${order.id}`);
    });

    if (dryRun) {
        console.log('\n✅ Dry run complete. No orders were deleted.');
        console.log('   Remove --dry-run to actually delete these orders.');
        return;
    }

    console.log('\n🗑️  Deleting orders...');

    const batch = db.batch();
    orders.forEach(order => {
        batch.delete(db.collection('orders').doc(order.id));
    });

    await batch.commit();
    console.log(`✅ Successfully deleted ${orders.length} order(s)`);
}

main().catch(console.error).finally(() => {
    process.exit(0);
});
