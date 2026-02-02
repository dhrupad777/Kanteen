import { Loader2 } from "lucide-react";

export default function Loading() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-orange-50">
            <div className="flex flex-col items-center gap-4">
                <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 animate-pulse" />
                    <Loader2 className="w-8 h-8 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                </div>
                <p className="text-orange-600 font-medium animate-pulse">Loading...</p>
            </div>
        </div>
    );
}
