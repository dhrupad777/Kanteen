import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
    return (
        <div className="flex-1 flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <p className="text-muted-foreground font-medium">Loading dashboard...</p>
            </div>
        </div>
    );
}
