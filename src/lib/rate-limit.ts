/**
 * Simple in-memory rate limiter
 * For production with multiple servers, upgrade to @upstash/ratelimit (Redis-based)
 */

interface RateLimitRecord {
    count: number;
    resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

// Cleanup old entries periodically (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
        if (now > record.resetTime) {
            rateLimitMap.delete(key);
        }
    }
}, 5 * 60 * 1000);

/**
 * Check if a request should be rate limited
 * @param key - Unique identifier (e.g., "create-order:192.168.1.1")
 * @param limit - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns Object with success flag and remaining requests
 */
export function rateLimit(
    key: string,
    limit: number = 10,
    windowMs: number = 60000
): { success: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const record = rateLimitMap.get(key);

    if (!record || now > record.resetTime) {
        rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
        return { success: true, remaining: limit - 1, resetIn: windowMs };
    }

    if (record.count >= limit) {
        return { success: false, remaining: 0, resetIn: record.resetTime - now };
    }

    record.count++;
    return { success: true, remaining: limit - record.count, resetIn: record.resetTime - now };
}

/**
 * Get client IP from request headers
 */
export function getClientIP(request: Request): string {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown';
}
