"use client";

import { useEffect, useRef, useState } from "react";
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
 *
 * The cache is a dedupe/throttle, NOT a snapshot of the board. The dashboard is
 * a long-lived PWA surface that can stay open for days, and the fetch effect only
 * re-runs when the signed-in user changes — so without the revalidation below the
 * board froze at whatever it showed on first paint. Students saw the same names
 * stuck at the top and their own new orders never moved their rank.
 */

const TTL_MS = 60_000;
const cache = new Map<string, { promise: Promise<LeaderboardResponse>; expires: number }>();

/** Every mounted useLeaderboard, so one invalidation refreshes the rank pill and
 *  the open dialog together. */
const subscribers = new Set<() => void>();

/**
 * Drop the cached board and refetch it wherever it is on screen.
 *
 * Called when the student's own payment is verified (their spend just changed)
 * and when they open the leaderboard dialog (an explicit "show me the board now").
 * Passive revalidation on tab focus stays TTL-throttled — this is the force path.
 */
export function invalidateLeaderboard() {
    cache.clear();
    subscribers.forEach((notify) => notify());
}

function fetchLeaderboard(uid: string, getToken: () => Promise<string>): Promise<LeaderboardResponse> {
    const key = `${uid}:${new Date().toISOString().slice(0, 7)}`;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.promise;

    const promise = (async () => {
        const token = await getToken();
        const res = await fetch('/api/leaderboard', {
            headers: { Authorization: `Bearer ${token}` },
            // The response is per-caller and changes as orders land; never let a
            // browser or CDN layer hand back a remembered copy.
            cache: 'no-store',
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
    const [revalidation, setRevalidation] = useState(0);
    /** Which uid the on-screen board belongs to, so a background refresh doesn't
     *  drop the student back to skeletons. */
    const loadedForUid = useRef<string | null>(null);

    useEffect(() => {
        const bump = () => setRevalidation((n) => n + 1);
        subscribers.add(bump);

        // Coming back to the tab is the moment a stale board is most obvious, and
        // it's the only signal that catches *other* students' orders. fetchLeaderboard
        // still honours TTL_MS, so rapid app-switching costs no extra requests.
        const onReturn = () => {
            if (document.visibilityState === 'visible') bump();
        };
        window.addEventListener('focus', onReturn);
        document.addEventListener('visibilitychange', onReturn);

        return () => {
            subscribers.delete(bump);
            window.removeEventListener('focus', onReturn);
            document.removeEventListener('visibilitychange', onReturn);
        };
    }, []);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            loadedForUid.current = null;
            setData(null);
            setLoading(false);
            return;
        }

        let active = true;
        // Skeletons only until this student has a board; every refresh after that
        // swaps the rows in underneath them.
        if (loadedForUid.current !== user.uid) setLoading(true);
        setError(false);

        fetchLeaderboard(user.uid, () => user.getIdToken())
            .then((result) => {
                if (!active) return;
                loadedForUid.current = user.uid;
                setData(result);
                setLoading(false);
            })
            .catch(() => {
                if (!active) return;
                // A failed *background* refresh keeps the board that's already on
                // screen — a blip while switching tabs shouldn't replace a working
                // leaderboard with an error. The next focus retries.
                if (loadedForUid.current !== user.uid) setError(true);
                setLoading(false);
            });

        return () => { active = false; };
    }, [user, authLoading, revalidation]);

    return { data, loading, error };
}
