"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { AdminGuard } from "@/components/AdminGuard";
import { RegistrationCard } from "@/components/RegistrationCard";
import { LogOut, Filter, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AdminDashboard() {
    const [registrations, setRegistrations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const router = useRouter();

    useEffect(() => {
        const q = query(collection(db, "registrations"), orderBy("createdAt", "desc"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setRegistrations(data);
            setLoading(false);
        }, (error) => {
            console.error("Dashboard Error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleLogout = async () => {
        await auth.signOut();
        router.push("/admin/login");
    };

    const filteredData = filter === "all"
        ? registrations
        : registrations.filter(r =>
            filter === "moot" ? r.event === "Moot Court" : r.event !== "Moot Court"
        );

    const stats = {
        total: registrations.length,
        moot: registrations.filter(r => r.event === "Moot Court").length,
        competitions: registrations.filter(r => r.event !== "Moot Court").length
    };

    return (
        <AdminGuard>
            <div className="min-h-screen bg-black text-white selection:bg-amber-500/30">
                {/* Navbar */}
                <nav className="border-b border-white/10 bg-[#0a0a0a] sticky top-0 z-50 backdrop-blur-md bg-opacity-80">
                    <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="w-2 h-8 bg-amber-500 rounded-full" />
                            <h1 className="font-bold text-lg tracking-wide">Vidhi Admin</h1>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 text-xs font-medium text-white/60 hover:text-red-400 transition-colors"
                        >
                            <LogOut size={16} />
                            Sign Out
                        </button>
                    </div>
                </nav>

                <main className="container mx-auto px-4 py-8 space-y-8">
                    {/* Stats Row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard label="Total Registrations" value={stats.total} />
                        <StatCard label="Moot Court Teams" value={stats.moot} color="amber" />
                        <StatCard label="Competition Entries" value={stats.competitions} color="blue" />
                    </div>

                    {/* Filters & Actions */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex gap-2 p-1 bg-white/5 rounded-lg border border-white/10">
                            {['all', 'moot', 'competitions'].map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-4 py-1.5 rounded text-sm font-medium transition-colors capitalize ${filter === f
                                        ? 'bg-amber-500 text-black shadow-lg'
                                        : 'text-white/60 hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                        <div className="text-xs text-white/40 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            Live Updates Active
                        </div>
                    </div>

                    {/* Grid */}
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} className="h-64 bg-white/5 rounded-xl border border-white/5" />
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredData.map((reg) => (
                                <RegistrationCard key={reg.id} data={reg} />
                            ))}
                        </div>
                    )}

                    {!loading && filteredData.length === 0 && (
                        <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl">
                            <p className="text-white/40">No registrations found matching your filter.</p>
                        </div>
                    )}

                </main>
            </div>
        </AdminGuard>
    );
}

function StatCard({ label, value, color = "white" }: { label: string, value: number, color?: string }) {
    const textColor = color === "amber" ? "text-amber-400" : color === "blue" ? "text-blue-400" : "text-white";
    return (
        <div className="bg-[#111] border border-white/10 p-4 rounded-xl">
            <p className="text-white/40 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
        </div>
    );
}
