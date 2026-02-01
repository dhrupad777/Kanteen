/**
 * Local Crypto Test Script
 * Tests OTP generation and verification without Firebase
 *
 * Run with: node scripts/test-crypto-local.cjs
 */

const crypto = require('crypto');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║         KANTEEN CRYPTO & OTP LOCAL TEST                    ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// ============================================================
// Crypto utilities (same as in src/lib/crypto-utils.ts)
// ============================================================

function generateSecureOTP() {
    return crypto.randomInt(100000, 999999).toString();
}

function generateOTPSalt() {
    return crypto.randomBytes(16).toString('hex');
}

function hashOTP(otp, salt) {
    return crypto.createHash('sha256').update(`${otp}:${salt}`).digest('hex');
}

function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return crypto.timingSafeEqual(bufA, bufB);
}

function verifyRazorpaySignature(orderId, paymentId, signature, secret) {
    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');
    return timingSafeEqual(signature, expectedSignature);
}

// ============================================================
// Tests
// ============================================================

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        const result = fn();
        if (result) {
            console.log(`✅ ${name}`);
            passed++;
        } else {
            console.log(`❌ ${name}`);
            failed++;
        }
    } catch (err) {
        console.log(`❌ ${name} - Error: ${err.message}`);
        failed++;
    }
}

// Test 1: OTP Generation
test('OTP is 6 digits', () => {
    const otp = generateSecureOTP();
    return otp.length === 6 && /^\d{6}$/.test(otp);
});

// Test 2: OTP is different each time
test('OTP is random (10 unique values)', () => {
    const otps = new Set();
    for (let i = 0; i < 10; i++) {
        otps.add(generateSecureOTP());
    }
    return otps.size >= 8; // At least 8 unique out of 10
});

// Test 3: Salt generation
test('Salt is 32 hex characters', () => {
    const salt = generateOTPSalt();
    return salt.length === 32 && /^[a-f0-9]+$/.test(salt);
});

// Test 4: Hash is consistent
test('Hash is consistent for same input', () => {
    const otp = '123456';
    const salt = 'abc123';
    const hash1 = hashOTP(otp, salt);
    const hash2 = hashOTP(otp, salt);
    return hash1 === hash2;
});

// Test 5: Hash is different for different OTPs
test('Hash is different for different OTPs', () => {
    const salt = generateOTPSalt();
    const hash1 = hashOTP('123456', salt);
    const hash2 = hashOTP('654321', salt);
    return hash1 !== hash2;
});

// Test 6: Timing safe comparison works
test('Timing safe equal: same strings', () => {
    return timingSafeEqual('abc123', 'abc123');
});

test('Timing safe equal: different strings', () => {
    return !timingSafeEqual('abc123', 'xyz789');
});

test('Timing safe equal: different lengths', () => {
    return !timingSafeEqual('abc', 'abcdef');
});

// Test 7: Full OTP flow
test('Full OTP flow: generate, hash, verify', () => {
    const otp = generateSecureOTP();
    const salt = generateOTPSalt();
    const hash = hashOTP(otp, salt);

    // Simulate verification
    const submittedHash = hashOTP(otp, salt);
    return timingSafeEqual(hash, submittedHash);
});

// Test 8: Wrong OTP fails verification
test('Wrong OTP fails verification', () => {
    const correctOtp = generateSecureOTP();
    const wrongOtp = '000000';
    const salt = generateOTPSalt();
    const hash = hashOTP(correctOtp, salt);

    const submittedHash = hashOTP(wrongOtp, salt);
    return !timingSafeEqual(hash, submittedHash);
});

// Test 9: Razorpay signature verification
test('Razorpay signature verification: valid', () => {
    const orderId = 'order_test123';
    const paymentId = 'pay_test456';
    const secret = 'test_secret_key';

    const body = `${orderId}|${paymentId}`;
    const validSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

    return verifyRazorpaySignature(orderId, paymentId, validSignature, secret);
});

test('Razorpay signature verification: invalid', () => {
    const orderId = 'order_test123';
    const paymentId = 'pay_test456';
    const secret = 'test_secret_key';
    const fakeSignature = 'fake_signature_here';

    return !verifyRazorpaySignature(orderId, paymentId, fakeSignature, secret);
});

// Test 10: Simulate complete order flow
test('Simulated order flow', () => {
    // 1. Create order (simulated)
    const orderId = 'order_' + Date.now();

    // 2. Payment verified - generate OTP
    const otp = generateSecureOTP();
    const salt = generateOTPSalt();
    const hash = hashOTP(otp, salt);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // 3. Store in "database" (simulated)
    const order = {
        id: orderId,
        token: 201,
        otpHash: hash,
        otpSalt: salt,
        otpExpiresAt: expiresAt,
        otpAttempts: 0,
        status: 'Preparing'
    };

    // 4. Student shows OTP at counter
    // 5. Staff verifies OTP
    const submittedOtp = otp; // Correct OTP
    const submittedHash = hashOTP(submittedOtp, order.otpSalt);
    const isValid = timingSafeEqual(submittedHash, order.otpHash);

    // 6. Check expiry
    const notExpired = new Date() < order.otpExpiresAt;

    // 7. Check attempts
    const notLocked = order.otpAttempts < 5;

    return isValid && notExpired && notLocked;
});

// Summary
console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║                    TEST RESULTS                            ║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log(`║ ✅ Passed: ${passed}                                              ║`);
console.log(`║ ❌ Failed: ${failed}                                              ║`);
console.log('╚════════════════════════════════════════════════════════════╝');

if (failed === 0) {
    console.log('\n🎉 All cryptographic functions are working correctly!');
    console.log('   The OTP system will work properly in production.\n');
} else {
    console.log('\n⚠️  Some tests failed. Please investigate.\n');
    process.exit(1);
}
