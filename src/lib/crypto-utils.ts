/**
 * Crypto utilities for secure comparisons and hashing
 */

import crypto from 'crypto';

/**
 * Timing-safe string comparison to prevent timing attacks
 * Returns true if strings are equal, false otherwise
 */
export function timingSafeEqual(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }

    // Convert strings to buffers
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');

    // If lengths differ, we still need to do a comparison to avoid timing leak
    if (bufA.length !== bufB.length) {
        // Compare with a dummy buffer of same length to maintain constant time
        const dummy = Buffer.alloc(bufA.length);
        crypto.timingSafeEqual(bufA, dummy);
        return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Hash OTP using SHA-256 with a salt
 */
export function hashOTP(otp: string, salt?: string): string {
    const data = salt ? `${otp}:${salt}` : otp;
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a cryptographically secure 4-digit OTP
 */
export function generateSecureOTP(): string {
    // Use crypto.randomInt for cryptographically secure random number
    const otp = crypto.randomInt(1000, 9999);
    return otp.toString();
}

/**
 * Generate a unique salt for OTP hashing
 */
export function generateOTPSalt(): string {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Verify Razorpay payment signature with timing-safe comparison
 */
export function verifyRazorpaySignature(
    orderId: string,
    paymentId: string,
    signature: string,
    secret: string
): boolean {
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

    return timingSafeEqual(expectedSignature, signature);
}

/**
 * Verify Razorpay webhook signature with timing-safe comparison
 */
export function verifyWebhookSignature(
    body: string,
    signature: string,
    secret: string
): boolean {
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

    return timingSafeEqual(expectedSignature, signature);
}
