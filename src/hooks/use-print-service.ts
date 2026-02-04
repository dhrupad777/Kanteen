"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './use-auth';

interface PrintJobItem {
    name: string;
    quantity: number;
    price: number;
}

interface PrintJob {
    id: string;
    orderId: string;
    token: number;
    items: PrintJobItem[];
    customerName?: string;
    isParcel?: boolean;
    status: string;
    createdAt: string;
    attempts?: number;
}

interface PrintQueueResponse {
    jobs: PrintJob[];
    count: number;
}

interface UsePrintServiceOptions {
    /** Polling interval in milliseconds (default: 5000) */
    pollInterval?: number;
    /** Whether to automatically start polling (default: false) */
    autoStart?: boolean;
    /** Callback when a new print job is received */
    onNewJob?: (job: PrintJob) => void;
    /** Printer identifier for claiming jobs */
    printerId?: string;
}

interface UsePrintServiceReturn {
    /** Current pending print jobs */
    jobs: PrintJob[];
    /** Loading state */
    loading: boolean;
    /** Error message if any */
    error: string | null;
    /** Whether polling is active */
    isPolling: boolean;
    /** Start polling for print jobs */
    startPolling: () => void;
    /** Stop polling */
    stopPolling: () => void;
    /** Manually fetch jobs once */
    fetchJobs: () => Promise<void>;
    /** Claim a job before printing */
    claimJob: (jobId: string) => Promise<boolean>;
    /** Mark a job as completed */
    completeJob: (jobId: string) => Promise<boolean>;
    /** Mark a job as failed */
    failJob: (jobId: string, error: string) => Promise<boolean>;
    /** Process a job: claim -> print -> complete */
    processJob: (jobId: string, printFn: (job: PrintJob) => Promise<void>) => Promise<boolean>;
}

/**
 * Hook for managing the print service queue.
 * Used by the kitchen mobile device to poll for and process print jobs.
 *
 * Workflow:
 * 1. Poll for queued jobs using fetchJobs()
 * 2. When job received, call claimJob() to lock it
 * 3. Send to printer
 * 4. Call completeJob() on success or failJob() on error
 */
export function usePrintService(options: UsePrintServiceOptions = {}): UsePrintServiceReturn {
    const { pollInterval = 5000, autoStart = false, onNewJob, printerId } = options;
    const { user } = useAuth();

    const [jobs, setJobs] = useState<PrintJob[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPolling, setIsPolling] = useState(autoStart);

    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const previousJobIdsRef = useRef<Set<string>>(new Set());

    const fetchJobs = useCallback(async () => {
        if (!user) return;

        try {
            setLoading(true);
            setError(null);

            const token = await user.getIdToken();
            const response = await fetch('/api/print/queue?status=queued&limit=20', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch print queue');
            }

            const data: PrintQueueResponse = await response.json();
            setJobs(data.jobs);

            // Check for new jobs and trigger callback
            if (onNewJob) {
                const currentJobIds = new Set(data.jobs.map(j => j.id));
                data.jobs.forEach(job => {
                    if (!previousJobIdsRef.current.has(job.id)) {
                        onNewJob(job);
                    }
                });
                previousJobIdsRef.current = currentJobIds;
            }
        } catch (err: any) {
            setError(err.message || 'Failed to fetch print jobs');
        } finally {
            setLoading(false);
        }
    }, [user, onNewJob]);

    const startPolling = useCallback(() => {
        setIsPolling(true);
    }, []);

    const stopPolling = useCallback(() => {
        setIsPolling(false);
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
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
                    // Job already claimed, remove from local state
                    setJobs(prev => prev.filter(j => j.id !== jobId));
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

            // Remove job from local state
            setJobs(prev => prev.filter(j => j.id !== jobId));
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

            // Remove job from local state (it will reappear on next poll if retrying)
            setJobs(prev => prev.filter(j => j.id !== jobId));
            return true;
        } catch (err: any) {
            setError(err.message || 'Failed to mark print job as failed');
            return false;
        }
    }, [user]);

    /**
     * Process a single print job with automatic claim/complete/fail handling
     */
    const processJob = useCallback(async (
        jobId: string,
        printFn: (job: PrintJob) => Promise<void>
    ): Promise<boolean> => {
        const job = jobs.find(j => j.id === jobId);
        if (!job) {
            setError('Job not found');
            return false;
        }

        // 1. Claim the job
        const claimed = await claimJob(jobId);
        if (!claimed) {
            return false;
        }

        try {
            // 2. Execute print function
            await printFn(job);

            // 3. Mark as completed
            await completeJob(jobId);
            return true;
        } catch (err: any) {
            // 4. Mark as failed
            await failJob(jobId, err.message || 'Print failed');
            return false;
        }
    }, [jobs, claimJob, completeJob, failJob]);

    // Setup polling effect
    useEffect(() => {
        if (isPolling && user) {
            // Initial fetch
            fetchJobs();

            // Setup interval
            pollIntervalRef.current = setInterval(fetchJobs, pollInterval);

            return () => {
                if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                }
            };
        }
    }, [isPolling, user, pollInterval, fetchJobs]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, []);

    return {
        jobs,
        loading,
        error,
        isPolling,
        startPolling,
        stopPolling,
        fetchJobs,
        claimJob,
        completeJob,
        failJob,
        processJob,
    };
}
