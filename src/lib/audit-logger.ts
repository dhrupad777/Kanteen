/**
 * Audit Logger - Records security-relevant events for compliance and debugging
 * Following OWASP logging recommendations
 */

import { getAdminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export type AuditEventType =
    | 'ORDER_CREATED'
    | 'PAYMENT_VERIFIED'
    | 'PAYMENT_FAILED'
    | 'WEBHOOK_PROCESSED'
    | 'WEBHOOK_DUPLICATE'
    | 'STATUS_CHANGED'
    | 'OTP_VERIFIED'
    | 'OTP_FAILED'
    | 'OTP_REGENERATED'
    | 'OTP_LOCKED'
    | 'INVALID_TRANSITION'
    | 'AMOUNT_MISMATCH'
    | 'SIGNATURE_INVALID';

export interface AuditLogEntry {
    eventType: AuditEventType;
    actorId: string;
    actorRole?: string;
    orderId?: string;
    ip: string;
    userAgent?: string;
    details?: Record<string, any>;
}

/**
 * Log an audit event to Firestore
 * This is fire-and-forget - we don't want audit logging to block the main flow
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
    try {
        const db = getAdminDb();
        await db.collection('audit_logs').add({
            ...entry,
            timestamp: FieldValue.serverTimestamp(),
            createdAt: new Date().toISOString(), // Backup in case serverTimestamp fails
        });
    } catch (error) {
        // Log to console but don't throw - audit should never break the main flow
        console.error('Failed to write audit log:', error instanceof Error ? error.message : 'Unknown error');
    }
}

/**
 * Get client IP from request headers
 */
export function getClientIP(request: Request): string {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown';
}

/**
 * Get user agent from request headers
 */
export function getUserAgent(request: Request): string {
    return request.headers.get('user-agent') || 'unknown';
}
