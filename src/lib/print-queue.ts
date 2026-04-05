/**
 * Print Queue Service
 * 
 * Implements the Outbox pattern for reliable ticket printing.
 * Print jobs are enqueued atomically with order confirmation,
 * ensuring no lost tickets even if printer is offline.
 */

import { getAdminDb } from './firebase-admin';
import { FieldValue, Transaction, WriteBatch } from 'firebase-admin/firestore';
import crypto from 'crypto';

export type PrintJobStatus = 'queued' | 'printing' | 'completed' | 'failed' | 'dead_letter';

export interface PrintJobPayload {
    orderId: string;
    token: number;
    items: Array<{ name: string; qty: number }>;
    totalPrice: number;
    parcelCharge: number;
    studentName?: string;
    studentEmail?: string;
    note?: string;
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

/**
 * Recover stale print jobs.
 * 
 * When the printer loses power or disconnects mid-print, jobs get stuck
 * in 'printing' state forever. This function finds jobs that have been
 * in 'printing' for more than `staleThresholdMs` and resets them to 'queued'.
 * 
 * This is CRITICAL for ACID-like guarantees:
 *   Payment confirmed → print job created (atomic via transaction)
 *   Print job stuck → recovered automatically → eventually printed
 * 
 * @param staleThresholdMs - How long before a 'printing' job is considered stale (default: 2 min)
 * @returns Number of jobs recovered
 */
export async function recoverStaleJobs(staleThresholdMs: number = 120_000): Promise<number> {
    const db = getAdminDb();
    const cutoff = new Date(Date.now() - staleThresholdMs);

    // Find jobs stuck in 'printing' with lastAttemptAt older than cutoff
    const snapshot = await db
        .collection('print_jobs')
        .where('status', '==', 'printing')
        .get();

    const staleJobs = snapshot.docs.filter((doc) => {
        const data = doc.data();
        const lastAttempt = data.lastAttemptAt?.toDate?.() ?? data.createdAt?.toDate?.();
        return !lastAttempt || lastAttempt < cutoff;
    });

    if (staleJobs.length === 0) return 0;

    // Commit all recoveries atomically — partial recovery is worse than no recovery
    const batch: WriteBatch = db.batch();
    for (const doc of staleJobs) {
        const data = doc.data();
        const attempts = data.attempts || 0;
        const maxAttempts = data.maxAttempts || 5;
        const newStatus: PrintJobStatus = attempts >= maxAttempts ? 'dead_letter' : 'queued';
        batch.update(doc.ref, {
            status: newStatus,
            error: newStatus === 'dead_letter'
                ? 'Exceeded max attempts after stale recovery'
                : "Recovered from stale 'printing' state",
            printerId: FieldValue.delete(),
        });
    }
    await batch.commit();

    return staleJobs.length;
}

/**
 * Get all jobs that need attention: queued (waiting) + failed (need retry).
 * Used by the kitchen print UI to show full queue state.
 */
export async function getFailedAndQueuedJobs(limitCount: number = 50): Promise<PrintJob[]> {
    const db = getAdminDb();

    // Firestore 'in' query allows up to 10 values
    const snapshot = await db
        .collection('print_jobs')
        .where('status', 'in', ['queued', 'failed', 'dead_letter'])
        .orderBy('createdAt', 'asc')
        .limit(limitCount)
        .get();

    return snapshot.docs.map(doc => ({
        jobId: doc.id,
        ...doc.data(),
    } as PrintJob));
}
