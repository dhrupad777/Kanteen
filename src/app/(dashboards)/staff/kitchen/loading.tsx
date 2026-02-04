import { KitchenViewSkeleton } from "@/components/skeletons";

export default function KitchenLoading() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6">
            <KitchenViewSkeleton />
        </div>
    );
}
