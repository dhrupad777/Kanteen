"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle } from "lucide-react";

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

        // Auto-refresh on chunk loading errors (cache mismatch after deployment)
        if (
            error.message?.includes("ChunkLoadError") ||
            error.message?.includes("Loading chunk") ||
            error.message?.includes("Failed to fetch dynamically imported module")
        ) {
            // Clear caches and reload
            if ("caches" in window) {
                caches.keys().then((names) => {
                    names.forEach((name) => caches.delete(name));
                });
            }
            // Reload after a short delay
            setTimeout(() => {
                window.location.reload();
            }, 100);
        }
    }, [error]);

    const handleRefresh = () => {
        // Clear caches before refresh
        if ("caches" in window) {
            caches.keys().then((names) => {
                names.forEach((name) => caches.delete(name));
            });
        }
        window.location.reload();
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
                        This might be due to a recent update. Please refresh the page.
                    </p>
                </div>

                <div className="flex flex-col gap-3">
                    <Button
                        onClick={handleRefresh}
                        className="w-full bg-primary hover:bg-primary/90"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh Page
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
