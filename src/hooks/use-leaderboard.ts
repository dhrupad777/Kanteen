"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./use-auth";
import type { LeaderboardResponse } from "@/types";

/**
 * Current month's spend leaderboard for the signed-in student.
 *
 * Two components on the dashboard need this — the leaderboard card and the rank
 * pill in the header — so the request is deduped at module scope rather than
 * fired twice. The cache holds the in-flight promise, which also covers React's
 * double-mount in development.
 *
 * Keyed by uid because the response carries per-caller fields (`isYou`, `you`).
 */

const TTL_MS = 60_000;
const cache = new Map<string, { promise: Promise<LeaderboardResponse>; expires: number }>();

function fetchLeaderboard(uid: string, getToken: () => Promise<string>): Promise<LeaderboardResponse> {
    const key = `${uid}:${new Date().toISOString().slice(0, 7)}`;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.promise;

    const promise = (async () => {
        const token = await getToken();
        const res = await fetch('/api/leaderboard', {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Leaderboard request failed: ${res.status}`);
        return (await res.json()) as LeaderboardResponse;
    })();

    // Don't cache a rejection — a student who loads the page while offline should
    // get a real attempt on their next visit, not a minute of remembered failure.
    promise.catch(() => cache.delete(key));

    cache.set(key, { promise, expires: Date.now() + TTL_MS });
    return promise;
}

interface UseLeaderboardResult {
    data: LeaderboardResponse | null;
    loading: boolean;
    error: boolean;
}

export function useLeaderboard(): UseLeaderboardResult {
    const { user, loading: authLoading } = useAuth();
    const [data, setData] = useState<LeaderboardResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            setData(null);
            setLoading(false);
            return;
        }

        let active = true;
        setLoading(true);
        setError(false);

        fetchLeaderboard(user.uid, () => user.getIdToken())
            .then((result) => {
                if (!active) return;
                setData(result);
                setLoading(false);
            })
            .catch(() => {
                if (!active) return;
                setError(true);
                setLoading(false);
            });

        return () => { active = false; };
    }, [user, authLoading]);

    return { data, loading, error };
}
