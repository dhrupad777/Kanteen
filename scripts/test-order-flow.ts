/**
 * Test Order Flow Script
 *
 * This script tests the complete order lifecycle without Razorpay.
 * Use this to verify:
 * - Token allocation works correctly
 * - OTP generation and hashing works
 * - Database operations are atomic
 * - State machine transitions work
 *
 * Run with: npx ts-node --esm scripts/test-order-flow.ts
 */

import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

// Initialize Firebase Admin
const projectId = process.env.FIREBASE_PROJECT_ID || 'studio-1083756985-9d2c6';

if (!admin.apps.length) {
    admin.initializeApp({ projectId });
}

const db = admin.firestore();

// ============================================================
// Crypto utilities (same as in src/lib/crypto-utils.ts)
// ============================================================

function generateSecureOTP(): string {
    return crypto.randomInt(100000, 999999).toString();
}

function generateOTPSalt(): string {
    return crypto.randomBytes(16).toString('hex');
}

function hashOTP(otp: string, salt: string): string {
    return crypto.createHash('sha256').update(`${otp}:${salt}`).digest('hex');
}

function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return crypto.timingSafeEqual(bufA, bufB);
}

// ============================================================
// Test Functions
// ============================================================

async function testTokenAllocation() {
    console.log('\n📝 Testing Token Allocation...');

    const dateKey = new Date().toISOString().split('T')[0];
    const counterRef = db.collection('order_counters').doc(`default_${dateKey}`);

    // Simulate two concurrent token allocations
    const results = await Promise.all([
        db.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let nextToken = 201;

            if (counterDoc.exists) {
                nextToken = counterDoc.data()?.nextOnlineToken ?? 201;
            }

            transaction.set(counterRef, {
                nextOnlineToken: nextToken + 1,
                dayKey: dateKey,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            return nextToken;
        }),
        db.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let nextToken = 201;

            if (counterDoc.exists) {
                nextToken = counterDoc.data()?.nextOnlineToken ?? 201;
            }

            transaction.set(counterRef, {
                nextOnlineToken: nextToken + 1,
                dayKey: dateKey,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            return nextToken;
        }),
    ]);

    console.log(`   Token 1: ${results[0]}`);
    console.log(`   Token 2: ${results[1]}`);

    if (results[0] !== results[1]) {
        console.log('   ✅ Concurrent token allocation works correctly (no duplicates)');
        return true;
    } else {
        console.log('   ❌ Tokens are duplicated - transaction isolation issue');
        return false;
    }
}

async function testOTPGeneration() {
    console.log('\n🔐 Testing OTP Generation & Verification...');

    // Generate OTP
    const otp = generateSecureOTP();
    const salt = generateOTPSalt();
    const hash = hashOTP(otp, salt);

    console.log(`   Generated OTP: ${otp}`);
    console.log(`   Salt: ${salt.substring(0, 8)}...`);
    console.log(`   Hash: ${hash.substring(0, 16)}...`);

    // Test verification
    const correctHash = hashOTP(otp, salt);
    const wrongHash = hashOTP('000000', salt);

    const correctResult = timingSafeEqual(hash, correctHash);
    const wrongResult = timingSafeEqual(hash, wrongHash);

    if (correctResult && !wrongResult) {
        console.log('   ✅ OTP verification works correctly');
        return true;
    } else {
        console.log('   ❌ OTP verification failed');
        return false;
    }
}

async function testCreateTestOrder() {
    console.log('\n📦 Creating Test Order...');

    const dateKey = new Date().toISOString().split('T')[0];
    const otp = generateSecureOTP();
    const salt = generateOTPSalt();
    const hash = hashOTP(otp, salt);

    const testOrder = {
        studentId: 'test-user-' + Date.now(),
        userName: 'Test User',
        userEmail: 'test@example.com',
        items: [
            { name: 'Test Item', quantity: 1, price: 50 },
        ],
        totalPrice: 50,
        isParcel: false,
        status: 'Preparing',
        token: 999, // Test token
        otpHash: hash,
        otpSalt: salt,
        otpExpiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
        otpAttempts: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        dateKey: dateKey,
        payment: {
            provider: 'test',
            status: 'paid',
            razorpayOrderId: 'test_order_' + Date.now(),
            razorpayPaymentId: 'test_payment_' + Date.now(),
        },
    };

    const orderRef = await db.collection('orders').add(testOrder);
    console.log(`   Order ID: ${orderRef.id}`);
    console.log(`   Token: ${testOrder.token}`);
    console.log(`   OTP: ${otp} (save this for verification test)`);

    return { orderId: orderRef.id, otp, salt, hash };
}

async function testOTPVerification(orderId: string, otp: string) {
    console.log('\n🔑 Testing OTP Verification Flow...');

    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
        console.log('   ❌ Order not found');
        return false;
    }

    const orderData = orderDoc.data()!;

    // Verify OTP
    const submittedHash = hashOTP(otp, orderData.otpSalt);
    const isValid = timingSafeEqual(submittedHash, orderData.otpHash);

    if (isValid) {
        console.log('   ✅ OTP verification successful');

        // Update order status
        await orderRef.update({
            status: 'PICKED_UP',
            'kitchen.pickedUpAt': admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log('   ✅ Order status updated to PICKED_UP');
        return true;
    } else {
        console.log('   ❌ OTP verification failed');
        return false;
    }
}

async function cleanupTestOrders() {
    console.log('\n🧹 Cleaning up test orders...');

    const testOrders = await db.collection('orders')
        .where('studentId', '>=', 'test-user-')
        .where('studentId', '<', 'test-user-z')
        .get();

    const batch = db.batch();
    testOrders.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    console.log(`   Deleted ${testOrders.size} test orders`);
}

// ============================================================
// Main Test Runner
// ============================================================

async function runTests() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║           KANTEEN ORDER FLOW TEST SUITE                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const results: { test: string; passed: boolean }[] = [];

    try {
        // Test 1: Token Allocation
        results.push({
            test: 'Token Allocation',
            passed: await testTokenAllocation(),
        });

        // Test 2: OTP Generation
        results.push({
            test: 'OTP Generation',
            passed: await testOTPGeneration(),
        });

        // Test 3: Create Order
        const orderResult = await testCreateTestOrder();
        results.push({
            test: 'Create Test Order',
            passed: !!orderResult.orderId,
        });

        // Test 4: OTP Verification
        if (orderResult.orderId) {
            results.push({
                test: 'OTP Verification',
                passed: await testOTPVerification(orderResult.orderId, orderResult.otp),
            });
        }

        // Cleanup
        await cleanupTestOrders();

    } catch (error) {
        console.error('\n❌ Test suite failed with error:', error);
    }

    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                            ║');
    console.log('╠════════════════════════════════════════════════════════════╣');

    results.forEach(r => {
        const status = r.passed ? '✅ PASS' : '❌ FAIL';
        console.log(`║ ${status} - ${r.test.padEnd(45)}║`);
    });

    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║ Total: ${passed}/${total} tests passed`.padEnd(61) + '║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    process.exit(passed === total ? 0 : 1);
}

runTests();
