"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';

interface PrintJobItem {
    name: string;
    qty: number;
}

interface PrintJob {
    id: string;
    orderId: string;
    token: number;
    items: PrintJobItem[];
    customerName?: string;
    customerEmail?: string;
    note?: string;
    isParcel?: boolean;
    status: 'queued' | 'printing' | 'completed' | 'failed' | 'dead_letter';
    createdAt: Date;
    attempts: number;
    error?: string;
}

interface UsePrintQueueRealtimeOptions {
    /** Whether to start listening immediately (default: false) */
    autoStart?: boolean;
    /** Callback when a new print job arrives */
    onNewJob?: (job: PrintJob) => void;
    /** Printer identifier for claiming jobs */
    printerId?: string;
    /** Max jobs to fetch (default: 50) */
    maxJobs?: number;
}

interface UsePrintQueueRealtimeReturn {
    /** Current queued print jobs */
    jobs: PrintJob[];
    /** Failed/dead-letter print jobs */
    failedJobs: PrintJob[];
    /** Last 20 completed print jobs (for receipt history + avg time) */
    completedJobs: PrintJob[];
    /** Pending count for badge display */
    pendingCount: number;
    /** Loading state */
    loading: boolean;
    /** Error message if any */
    error: string | null;
    /** Whether real-time listening is active */
    isListening: boolean;
    /** Start listening for print jobs */
    startListening: () => void;
    /** Stop listening */
    stopListening: () => void;
    /** Claim a job before printing */
    claimJob: (jobId: string) => Promise<boolean>;
    /** Mark a job as completed */
    completeJob: (jobId: string) => Promise<boolean>;
    /** Mark a job as failed */
    failJob: (jobId: string, error: string) => Promise<boolean>;
    /** Retry a failed/dead-letter job */
    retryJob: (jobId: string) => Promise<boolean>;
    /** Recover stale jobs stuck in 'printing' state */
    recoverStaleJobs: () => Promise<number>;
}

/**
 * Real-time print queue hook using Firestore onSnapshot.
 * Provides instant notifications when new print jobs arrive.
 * 
 * Listens for BOTH 'queued' (ready to print) and 'failed'/'dead_letter'
 * (need attention) jobs to ensure nothing is lost.
 *
 * Much faster than polling - jobs appear within ~100ms of creation.
 */
export function usePrintQueueRealtime(options: UsePrintQueueRealtimeOptions = {}): UsePrintQueueRealtimeReturn {
    const { autoStart = false, onNewJob, printerId, maxJobs = 50 } = options;
    const { user } = useAuth();

    const [jobs, setJobs] = useState<PrintJob[]>([]);
    const [failedJobs, setFailedJobs] = useState<PrintJob[]>([]);
    const [completedJobs, setCompletedJobs] = useState<PrintJob[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isListening, setIsListening] = useState(autoStart);

    const unsubscribeQueuedRef = useRef<(() => void) | null>(null);
    const unsubscribeFailedRef = useRef<(() => void) | null>(null);
    const unsubscribeCompletedRef = useRef<(() => void) | null>(null);
    const previousJobIdsRef = useRef<Set<string>>(new Set());
    const onNewJobRef = useRef(onNewJob);

    // Keep onNewJob callback ref updated
    useEffect(() => {
        onNewJobRef.current = onNewJob;
    }, [onNewJob]);

    const startListening = useCallback(() => {
        setIsListening(true);
    }, []);

    const stopListening = useCallback(() => {
        setIsListening(false);
        if (unsubscribeQueuedRef.current) {
            unsubscribeQueuedRef.current();
            unsubscribeQueuedRef.current = null;
        }
        if (unsubscribeFailedRef.current) {
            unsubscribeFailedRef.current();
            unsubscribeFailedRef.current = null;
        }
        if (unsubscribeCompletedRef.current) {
            unsubscribeCompletedRef.current();
            unsubscribeCompletedRef.current = null;
        }
    }, []);

    // Parse a Firestore doc into a PrintJob
    const parseJob = (doc: any): PrintJob => {
        const data = doc.data();
        return {
            id: doc.id,
            orderId: data.payload?.orderId || doc.id,
            token: data.payload?.token || 0,
            items: data.payload?.items || [],
            customerName: data.payload?.studentName,
            customerEmail: data.payload?.studentEmail,
            note: data.payload?.note,
            isParcel: data.payload?.isParcel || false,
            status: data.status,
            createdAt: data.createdAt instanceof Timestamp
                ? data.createdAt.toDate()
                : new Date(data.payload?.createdAt || Date.now()),
            attempts: data.attempts || 0,
            error: data.error,
        };
    };

    // Real-time Firestore listener for QUEUED jobs
    useEffect(() => {
        if (!isListening || !user) {
            return;
        }

        setLoading(true);
        setError(null);

        // === Listener 1: Queued jobs (ready to print) ===
        const queuedQuery = query(
            collection(db, 'print_jobs'),
            where('status', '==', 'queued'),
            orderBy('createdAt', 'asc'),
            limit(maxJobs)
        );

        const unsubQueued = onSnapshot(
            queuedQuery,
            (snapshot) => {
                const newJobs: PrintJob[] = [];
                const currentJobIds = new Set<string>();

                snapshot.forEach((doc) => {
                    currentJobIds.add(doc.id);
                    const job = parseJob(doc);
                    newJobs.push(job);

                    // Check if this is a new job and trigger callback
                    if (!previousJobIdsRef.current.has(doc.id) && onNewJobRef.current) {
                        setTimeout(() => {
                            onNewJobRef.current?.(job);
                        }, 100);
                    }
                });

                previousJobIdsRef.current = currentJobIds;
                setJobs(newJobs);
                setLoading(false);
            },
            (err) => {
                console.error('Print queue listener error:', err);
                if (err.code !== 'permission-denied') {
                    setError(err.message || 'Failed to listen for print jobs');
                }
                setLoading(false);
            }
        );

        // === Listener 2: Failed + dead_letter jobs (need attention) ===
        const failedQuery = query(
            collection(db, 'print_jobs'),
            where('status', 'in', ['failed', 'dead_letter']),
            orderBy('createdAt', 'asc'),
            limit(maxJobs)
        );

        const unsubFailed = onSnapshot(
            failedQuery,
            (snapshot) => {
                const failed: PrintJob[] = [];
                snapshot.forEach((doc) => {
                    failed.push(parseJob(doc));
                });
                setFailedJobs(failed);
            },
            (err) => {
                // Silently ignore failed listener errors (non-critical)
                console.error('Failed jobs listener error:', err);
            }
        );

        // === Listener 3: Completed jobs (receipt history, last 20) ===
        const completedQuery = query(
            collection(db, 'print_jobs'),
            where('status', '==', 'completed'),
            orderBy('completedAt', 'desc'),
            limit(20)
        );

        const unsubCompleted = onSnapshot(
            completedQuery,
            (snapshot) => {
                const completed: PrintJob[] = [];
                snapshot.forEach((doc) => {
                    completed.push(parseJob(doc));
                });
                setCompletedJobs(completed);
            },
            () => { /* non-critical, ignore errors */ }
        );

        unsubscribeQueuedRef.current = unsubQueued;
        unsubscribeFailedRef.current = unsubFailed;
        unsubscribeCompletedRef.current = unsubCompleted;

        return () => {
            unsubQueued();
            unsubFailed();
            unsubCompleted();
            unsubscribeQueuedRef.current = null;
            unsubscribeFailedRef.current = null;
            unsubscribeCompletedRef.current = null;
        };
    }, [isListening, user, maxJobs]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (unsubscribeQueuedRef.current) unsubscribeQueuedRef.current();
            if (unsubscribeFailedRef.current) unsubscribeFailedRef.current();
            if (unsubscribeCompletedRef.current) unsubscribeCompletedRef.current();
        };
    }, []);

    const claimJob = useCallback(async (jobId: string): Promise<boolean> => {
        if (!user) return false;

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/print/claim', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ jobId, printerId }),
            });

            if (!response.ok) {
                if (response.status === 409) {
                    return false;
                }
                throw new Error('Failed to claim print job');
            }

            return true;
        } catch (err: any) {
            setError(err.message || 'Failed to claim print job');
            return false;
        }
    }, [user, printerId]);

    const completeJob = useCallback(async (jobId: string): Promise<boolean> => {
        if (!user) return false;

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/print/complete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ jobId }),
            });

            if (!response.ok) {
                throw new Error('Failed to complete print job');
            }

            return true;
        } catch (err: any) {
            setError(err.message || 'Failed to complete print job');
            return false;
        }
    }, [user]);

    const failJob = useCallback(async (jobId: string, errorMsg: string): Promise<boolean> => {
        if (!user) return false;

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/print/fail', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ jobId, error: errorMsg }),
            });

            if (!response.ok) {
                throw new Error('Failed to mark print job as failed');
            }

            return true;
        } catch (err: any) {
            setError(err.message || 'Failed to mark print job as failed');
            return false;
        }
    }, [user]);

    const retryJob = useCallback(async (jobId: string): Promise<boolean> => {
        if (!user) return false;

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/print/retry', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ jobId }),
            });

            if (!response.ok) {
                throw new Error('Failed to retry print job');
            }

            return true;
        } catch (err: any) {
            setError(err.message || 'Failed to retry print job');
            return false;
        }
    }, [user]);

    const recoverStaleJobs = useCallback(async (): Promise<number> => {
        if (!user) return 0;

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/print/recover', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to recover stale jobs');
            }

            const data = await response.json();
            return data.recovered || 0;
        } catch (err: any) {
            console.error('Recover stale jobs error:', err);
            return 0;
        }
    }, [user]);

    return {
        jobs,
        failedJobs,
        completedJobs,
        pendingCount: jobs.length,
        loading,
        error,
        isListening,
        startListening,
        stopListening,
        claimJob,
        completeJob,
        failJob,
        retryJob,
        recoverStaleJobs,
    };
}
