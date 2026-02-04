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
}

/**
 * Real-time print queue hook using Firestore onSnapshot.
 * Provides instant notifications when new print jobs arrive.
 *
 * Much faster than polling - jobs appear within ~100ms of creation.
 */
export function usePrintQueueRealtime(options: UsePrintQueueRealtimeOptions = {}): UsePrintQueueRealtimeReturn {
    const { autoStart = false, onNewJob, printerId, maxJobs = 50 } = options;
    const { user } = useAuth();

    const [jobs, setJobs] = useState<PrintJob[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isListening, setIsListening] = useState(autoStart);

    const unsubscribeRef = useRef<(() => void) | null>(null);
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
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }
    }, []);

    // Real-time Firestore listener
    useEffect(() => {
        if (!isListening || !user) {
            return;
        }

        setLoading(true);
        setError(null);

        // Query for queued print jobs
        const q = query(
            collection(db, 'print_jobs'),
            where('status', '==', 'queued'),
            orderBy('createdAt', 'asc'),
            limit(maxJobs)
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const newJobs: PrintJob[] = [];
                const currentJobIds = new Set<string>();

                snapshot.forEach((doc) => {
                    const data = doc.data();
                    currentJobIds.add(doc.id);

                    const job: PrintJob = {
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
                    };

                    newJobs.push(job);

                    // Check if this is a new job and trigger callback
                    if (!previousJobIdsRef.current.has(doc.id) && onNewJobRef.current) {
                        // Small delay to ensure state is updated first
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
                // Don't show permission errors as they're expected for non-managers
                if (err.code !== 'permission-denied') {
                    setError(err.message || 'Failed to listen for print jobs');
                }
                setLoading(false);
            }
        );

        unsubscribeRef.current = unsubscribe;

        return () => {
            unsubscribe();
            unsubscribeRef.current = null;
        };
    }, [isListening, user, maxJobs]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (unsubscribeRef.current) {
                unsubscribeRef.current();
            }
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
                    // Job already claimed by another printer
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

    return {
        jobs,
        pendingCount: jobs.length,
        loading,
        error,
        isListening,
        startListening,
        stopListening,
        claimJob,
        completeJob,
        failJob,
    };
}
