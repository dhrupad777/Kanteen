/**
 * Kanteen Load Tests
 * 
 * Run with k6:
 *   k6 run tests/load/concurrent-orders.js
 * 
 * Prerequisites:
 *   - npm install -g k6
 *   - Set BASE_URL environment variable
 *   - Set TEST_TOKEN (Firebase ID token) for authenticated requests
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// ==================== CONFIGURATION ====================

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TEST_TOKEN = __ENV.TEST_TOKEN || 'test-token';

export const options = {
    scenarios: {
        // Scenario A: 50 students pay at once
        peak_burst: {
            executor: 'ramping-arrival-rate',
            startRate: 10,
            timeUnit: '1s',
            preAllocatedVUs: 100,
            maxVUs: 200,
            stages: [
                { duration: '10s', target: 50 },  // Ramp up to 50 RPS
                { duration: '30s', target: 50 },  // Hold at 50 RPS
                { duration: '10s', target: 0 },   // Ramp down
            ],
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<800'],    // 95% of requests under 800ms
        http_req_failed: ['rate<0.01'],       // Less than 1% failure rate
        token_duplicates: ['count==0'],       // No duplicate tokens
        print_duplicates: ['count==0'],       // No duplicate print jobs
    },
};

// ==================== CUSTOM METRICS ====================

const tokenDuplicates = new Counter('token_duplicates');
const printDuplicates = new Counter('print_duplicates');
const orderCreationTime = new Trend('order_creation_time');
const paymentVerificationTime = new Trend('payment_verification_time');
const statusUpdateTime = new Trend('status_update_time');

// Track issued tokens for duplicate detection
const issuedTokens = new Set();
const processedOrders = new Set();

// ==================== TEST DATA ====================

const testItems = [
    { itemId: 'samosa', name: 'Samosa', qty: 2, price: 20 },
    { itemId: 'tea', name: 'Tea', qty: 1, price: 10 },
];

// ==================== HELPER FUNCTIONS ====================

function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`,
    };
}

function createOrder() {
    const payload = JSON.stringify({
        items: testItems,
        isParcel: false,
    });

    const res = http.post(`${BASE_URL}/api/razorpay/create-order`, payload, {
        headers: getHeaders(),
        tags: { name: 'CreateOrder' },
    });

    check(res, {
        'create-order status is 200': (r) => r.status === 200,
        'create-order has orderId': (r) => JSON.parse(r.body).orderId !== undefined,
    });

    orderCreationTime.add(res.timings.duration);

    if (res.status === 200) {
        return JSON.parse(res.body);
    }
    return null;
}

function verifyPayment(orderId, razorpayOrderId) {
    // Simulate Razorpay callback (in real test, use mock Razorpay)
    const payload = JSON.stringify({
        orderId: orderId,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        razorpay_signature: 'test_signature', // Would need real signature in staging
    });

    const res = http.post(`${BASE_URL}/api/razorpay/verify-payment`, payload, {
        headers: getHeaders(),
        tags: { name: 'VerifyPayment' },
    });

    check(res, {
        'verify-payment status is 200 or 400': (r) => r.status === 200 || r.status === 400,
    });

    paymentVerificationTime.add(res.timings.duration);

    if (res.status === 200) {
        const data = JSON.parse(res.body);

        // Check for duplicate tokens
        if (issuedTokens.has(data.token)) {
            tokenDuplicates.add(1);
            console.error(`DUPLICATE TOKEN DETECTED: ${data.token}`);
        } else {
            issuedTokens.add(data.token);
        }

        // Check for duplicate order processing
        if (processedOrders.has(orderId)) {
            printDuplicates.add(1);
            console.error(`DUPLICATE ORDER PROCESSING: ${orderId}`);
        } else {
            processedOrders.add(orderId);
        }

        return data;
    }
    return null;
}

function updateStatus(orderId, newStatus) {
    const payload = JSON.stringify({ status: newStatus });

    const res = http.post(`${BASE_URL}/api/staff/orders/${orderId}/status`, payload, {
        headers: getHeaders(),
        tags: { name: 'StatusUpdate' },
    });

    check(res, {
        'status-update is 200': (r) => r.status === 200,
    });

    statusUpdateTime.add(res.timings.duration);
    return res.status === 200;
}

function verifyOTP(orderId, otp) {
    const payload = JSON.stringify({ otp });

    const res = http.post(`${BASE_URL}/api/staff/orders/${orderId}/verify-otp`, payload, {
        headers: getHeaders(),
        tags: { name: 'VerifyOTP' },
    });

    check(res, {
        'verify-otp is 200 or 400': (r) => r.status === 200 || r.status === 400,
    });

    return res.status === 200;
}

// ==================== MAIN TEST SCENARIO ====================

export default function () {
    group('Full Order Lifecycle', () => {
        // Step 1: Create order
        const order = createOrder();
        if (!order) {
            console.error('Failed to create order');
            return;
        }

        sleep(0.5); // Simulate user interaction delay

        // Step 2: Verify payment
        const verification = verifyPayment(order.orderId, order.razorpayOrderId);
        if (!verification) {
            console.error('Failed to verify payment');
            return;
        }

        console.log(`Order ${order.orderId} confirmed with token ${verification.token}`);

        sleep(1); // Simulate kitchen prep time

        // Step 3: Mark as Ready (kitchen staff)
        const readySuccess = updateStatus(order.orderId, 'Ready');
        if (!readySuccess) {
            console.error('Failed to mark order as Ready');
            return;
        }

        sleep(0.5);

        // Step 4: Verify OTP for pickup
        const pickupSuccess = verifyOTP(order.orderId, verification.otp);
        if (!pickupSuccess) {
            console.error('Failed to verify OTP');
        }
    });
}

// ==================== TEARDOWN ====================

export function handleSummary(data) {
    console.log('\n========== LOAD TEST SUMMARY ==========');
    console.log(`Total requests: ${data.metrics.http_reqs.values.count}`);
    console.log(`Failed requests: ${data.metrics.http_req_failed.values.rate * 100}%`);
    console.log(`P95 latency: ${data.metrics.http_req_duration.values['p(95)']}ms`);
    console.log(`Duplicate tokens: ${data.metrics.token_duplicates?.values.count || 0}`);
    console.log(`Duplicate print jobs: ${data.metrics.print_duplicates?.values.count || 0}`);
    console.log('========================================\n');

    return {
        'stdout': JSON.stringify(data, null, 2),
    };
}
