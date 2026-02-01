/**
 * Print Queue Service
 * 
 * Implements the Outbox pattern for reliable ticket printing.
 * Print jobs are enqueued atomically with order confirmation,
 * ensuring no lost tickets even if printer is offline.
 */

import { getAdminDb } from './firebase-admin';
import { FieldValue, Transaction } from 'firebase-admin/firestore';
import crypto from 'crypto';

export type PrintJobStatus = 'queued' | 'printing' | 'completed' | 'failed' | 'dead_letter';

export interface PrintJobPayload {
    orderId: string;
    token: number;
    items: Array<{ name: string; qty: number }>;
    studentName?: string;
    isParcel: boolean;
    createdAt: string;
}

export interface PrintJob {
    jobId: string; // Same as orderId for idempotency
    status: PrintJobStatus;
    payload: PrintJobPayload;
    payloadHash: string;
    attempts: number;
    maxAttempts: number;
    createdAt: any;
    lastAttemptAt?: any;
    completedAt?: any;
    printerId?: string;
    error?: string;
}

/**
 * Create a hash of the print payload for integrity verification
 */
function hashPayload(payload: PrintJobPayload): string {
    const json = JSON.stringify(payload);
    return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * Enqueue a print job within a Firestore transaction
 * This should be called in the same transaction as order confirmation
 * to ensure atomicity (order confirmed ⟺ print job exists)
 * 
 * @param transaction - Active Firestore transaction
 * @param orderId - Order ID (used as jobId for idempotency)
 * @param payload - Print ticket content
 */
export function enqueuePrintJobTransaction(
    transaction: Transaction,
    orderId: string,
    payload: PrintJobPayload
): void {
    const db = getAdminDb();
    const jobRef = db.collection('print_jobs').doc(orderId);

    const job: Omit<PrintJob, 'jobId'> = {
        status: 'queued',
        payload,
        payloadHash: hashPayload(payload),
        attempts: 0,
        maxAttempts: 5,
        createdAt: FieldValue.serverTimestamp(),
    };

    // Use create() for true idempotency - fails if doc exists
    transaction.create(jobRef, job);
}

/**
 * Get queued print jobs for processing
 * Used by the printer worker
 */
export async function getQueuedPrintJobs(limit: number = 10): Promise<PrintJob[]> {
    const db = getAdminDb();
    const snapshot = await db
        .collection('print_jobs')
        .where('status', '==', 'queued')
        .orderBy('createdAt', 'asc')
        .limit(limit)
        .get();

    return snapshot.docs.map(doc => ({
        jobId: doc.id,
        ...doc.data(),
    } as PrintJob));
}

/**
 * Mark a print job as printing (claim it)
 */
export async function claimPrintJob(jobId: string, printerId: string): Promise<boolean> {
    const db = getAdminDb();
    const jobRef = db.collection('print_jobs').doc(jobId);

    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(jobRef);
            if (!doc.exists || doc.data()?.status !== 'queued') {
                throw new Error('Job not available');
            }

            transaction.update(jobRef, {
                status: 'printing',
                printerId,
                lastAttemptAt: FieldValue.serverTimestamp(),
                attempts: FieldValue.increment(1),
            });
        });
        return true;
    } catch {
        return false;
    }
}

/**
 * Mark a print job as completed
 */
export async function completePrintJob(jobId: string): Promise<void> {
    const db = getAdminDb();
    await db.collection('print_jobs').doc(jobId).update({
        status: 'completed',
        completedAt: FieldValue.serverTimestamp(),
    });
}

/**
 * Mark a print job as failed (for retry or dead letter)
 */
export async function failPrintJob(jobId: string, error: string): Promise<void> {
    const db = getAdminDb();
    const jobRef = db.collection('print_jobs').doc(jobId);

    await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(jobRef);
        if (!doc.exists) return;

        const data = doc.data()!;
        const attempts = data.attempts || 0;
        const maxAttempts = data.maxAttempts || 5;

        const newStatus: PrintJobStatus = attempts >= maxAttempts ? 'dead_letter' : 'queued';

        transaction.update(jobRef, {
            status: newStatus,
            error,
            lastAttemptAt: FieldValue.serverTimestamp(),
        });
    });
}

/**
 * Get failed/dead letter jobs for monitoring
 */
export async function getDeadLetterJobs(): Promise<PrintJob[]> {
    const db = getAdminDb();
    const snapshot = await db
        .collection('print_jobs')
        .where('status', '==', 'dead_letter')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

    return snapshot.docs.map(doc => ({
        jobId: doc.id,
        ...doc.data(),
    } as PrintJob));
}

/**
 * Retry a dead letter job (manual intervention)
 */
export async function retryDeadLetterJob(jobId: string): Promise<void> {
    const db = getAdminDb();
    await db.collection('print_jobs').doc(jobId).update({
        status: 'queued',
        attempts: 0,
        error: FieldValue.delete(),
    });
}
