"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle } from "lucide-react";

/** Marks that this tab has already tried to auto-recover, so we never loop. */
const RECOVERY_KEY = "kanteen_chunk_recovery";

/**
 * Clear every cache and unregister the service worker, then reload.
 *
 * Both steps are awaited: `caches.delete()` and `unregister()` are async, and an
 * un-awaited teardown followed by an immediate reload just reloads with the same
 * stale assets — which is what turned a one-off chunk error into a reload loop.
 */
async function resetAndReload() {
    try {
        if ("caches" in window) {
            const names = await caches.keys();
            await Promise.all(names.map((name) => caches.delete(name)));
        }
    } catch {
        // Best effort — still unregister and reload below.
    }

    try {
        if ("serviceWorker" in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((r) => r.unregister()));
        }
    } catch {
        // Best effort.
    }

    window.location.reload();
}

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log error for debugging
        console.error("App error:", error);

        // Chunk errors usually mean the client is holding assets from a previous
        // deployment. ChunkLoadError is the error's *name*, never part of its message.
        const isChunkError =
            error.name === "ChunkLoadError" ||
            error.message?.includes("ChunkLoadError") ||
            error.message?.includes("Loading chunk") ||
            error.message?.includes("Failed to fetch dynamically imported module");

        if (!isChunkError) return;

        // Recover at most ONCE per tab. Without this guard, an error that survives
        // the reload reloads again, forever.
        let alreadyTried = false;
        try {
            alreadyTried = sessionStorage.getItem(RECOVERY_KEY) === "1";
            sessionStorage.setItem(RECOVERY_KEY, "1");
        } catch {
            // sessionStorage unavailable (private mode) — treat as already tried so
            // we show the manual UI rather than risking a loop we can't detect.
            alreadyTried = true;
        }

        if (alreadyTried) return; // fall through to the error UI below

        resetAndReload();
    }, [error]);

    // Reaching this component with a non-chunk error, or after a successful recovery,
    // means the tab is usable again — let a genuine future chunk error self-heal.
    useEffect(() => {
        return () => {
            try {
                sessionStorage.removeItem(RECOVERY_KEY);
            } catch {
                // ignore
            }
        };
    }, []);

    const handleRefresh = () => {
        // Same awaited teardown as the automatic path.
        try {
            sessionStorage.removeItem(RECOVERY_KEY);
        } catch {
            // ignore
        }
        resetAndReload();
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-orange-50 p-6">
            <div className="max-w-md w-full bg-white rounded-2xl p-8 shadow-lg text-center space-y-6">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-8 h-8 text-orange-600" />
                </div>

                <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">
                        Something went wrong
                    </h2>
                    <p className="text-sm text-gray-500">
                        This might be due to a recent update. Resetting the app clears
                        its stored files and reloads a fresh copy.
                    </p>
                </div>

                <div className="flex flex-col gap-3">
                    <Button
                        onClick={handleRefresh}
                        className="w-full bg-primary hover:bg-primary/90"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Reset &amp; Reload
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => reset()}
                        className="w-full"
                    >
                        Try Again
                    </Button>
                </div>
            </div>
        </div>
    );
}
