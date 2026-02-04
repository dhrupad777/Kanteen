import { StudentDashboardSkeleton } from "@/components/skeletons";

export default function DashboardLoading() {
    return (
        <div className="flex-1 py-4">
            <StudentDashboardSkeleton />
        </div>
    );
}
