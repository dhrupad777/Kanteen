import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
    return (
        <div className="min-h-screen bg-orange-50 p-4">
            {/* Header skeleton */}
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between py-4 border-b border-orange-100 mb-6">
                    <Skeleton className="h-10 w-32" />
                    <Skeleton className="h-10 w-10 rounded-full" />
                </div>

                {/* Main content skeleton */}
                <div className="space-y-6">
                    {/* Welcome section */}
                    <Skeleton className="h-9 w-48" />

                    {/* Cards grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white rounded-xl p-4 border border-orange-100">
                            <Skeleton className="h-6 w-32 mb-3" />
                            <div className="grid grid-cols-3 gap-2">
                                <Skeleton className="h-20 rounded-lg" />
                                <Skeleton className="h-20 rounded-lg" />
                                <Skeleton className="h-20 rounded-lg" />
                            </div>
                        </div>
                        <div className="bg-white rounded-xl p-4 border border-orange-100">
                            <Skeleton className="h-6 w-24 mb-3" />
                            <Skeleton className="h-32 rounded-lg" />
                        </div>
                    </div>

                    {/* Action button */}
                    <Skeleton className="h-16 w-full rounded-2xl" />
                </div>
            </div>
        </div>
    );
}
