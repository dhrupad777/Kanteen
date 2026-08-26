"use client";

import { useState, useEffect } from "react";
import { addMonths, format } from "date-fns";
import { Loader2, Download, Trophy, ChevronLeft, ChevronRight, Users, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { LeaderboardEntry, LeaderboardResponse } from "@/types";

/**
 * Owner view of the monthly spend leaderboard — the one place ₹ amounts appear.
 *
 * Uses the Firebase ID token directly: the staff session from /staff-login is the
 * same Auth user, so the token carries the `role` claim that /api/leaderboard
 * checks before it attaches amounts.
 *
 * Rows are stacked flex, not <Table> — the rest of the app is card-based and a
 * 5-column table forces horizontal scrolling on a phone.
 */

const MEDALS = ['🥇', '🥈', '🥉'];

function currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

export function LeaderboardManager() {
    const { user } = useAuth();
    const [month, setMonth] = useState(currentMonth);
    const [data, setData] = useState<LeaderboardResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        let active = true;
        setLoading(true);
        setError(null);

        (async () => {
            try {
                const token = await user.getIdToken();
                const res = await fetch(`/api/leaderboard?month=${month}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error(`Request failed: ${res.status}`);
                const json = (await res.json()) as LeaderboardResponse;
                if (!active) return;
                setData(json);
            } catch {
                if (!active) return;
                setError("Could not load the leaderboard.");
            } finally {
                if (active) setLoading(false);
            }
        })();

        return () => { active = false; };
    }, [user, month]);

    const monthDate = new Date(`${month}-01T00:00:00`);
    const isCurrentMonth = month === currentMonth();
    const entries: LeaderboardEntry[] = data?.entries ?? [];
    // Per-entry totals carry paise, so round the running sum too.
    const totalSpent = Math.round(entries.reduce((sum, e) => sum + (e.spent ?? 0), 0) * 100) / 100;

    function downloadCSV() {
        const rows = entries.map((e) => [e.rank, `"${e.displayName.replace(/"/g, '""')}"`, e.spent ?? 0, e.orders ?? 0]);

        let csvContent = `Spend Leaderboard for ${format(monthDate, 'MMMM yyyy')}\n`;
        csvContent += `Students,${entries.length}\n`;
        csvContent += `Total,₹${totalSpent}\n\n`;
        csvContent += "Rank,Name,Spent,Orders\n";
        rows.forEach((row) => { csvContent += row.join(",") + "\n"; });

        // '﻿' is the UTF-8 BOM — tells Excel to open the file as UTF-8
        // so ₹ renders correctly instead of appearing as â‚¹
        const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Kanteen_Leaderboard_${month}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-black tracking-tight">Spend Leaderboard</h3>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Collected Orders • Per Student
                </p>
            </div>

            {/* Month selector — sized to fit a 360px screen */}
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Previous month"
                    onClick={() => setMonth(format(addMonths(monthDate, -1), 'yyyy-MM'))}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-black tracking-tight">
                    {format(monthDate, 'MMMM yyyy')}
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Next month"
                    disabled={isCurrentMonth}
                    onClick={() => setMonth(format(addMonths(monthDate, 1), 'yyyy-MM'))}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : error ? (
                <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{error}</CardContent></Card>
            ) : entries.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
                        <Trophy className="h-8 w-8 text-slate-300" />
                        <p className="text-sm text-muted-foreground">
                            No collected orders in {format(monthDate, 'MMMM yyyy')}.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3">
                        <Card>
                            <CardContent className="flex items-center gap-3 p-4">
                                <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0">
                                    <p className="text-xl font-black tabular-nums leading-none">{entries.length}</p>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Students</p>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="flex items-center gap-3 p-4">
                                <IndianRupee className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0">
                                    <p className="truncate text-xl font-black tabular-nums leading-none">
                                        {totalSpent.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                    </p>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">On the board</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="overflow-hidden">
                        <CardContent className="divide-y divide-slate-100 p-0">
                            {entries.map((entry) => (
                                <div key={entry.rank} className="flex items-center gap-3 px-4 py-3">
                                    <span className={cn(
                                        "w-7 shrink-0 text-center font-black tabular-nums",
                                        entry.rank <= 3 ? "text-base" : "text-sm text-muted-foreground",
                                    )}>
                                        {MEDALS[entry.rank - 1] ?? entry.rank}
                                    </span>

                                    <Avatar className="h-8 w-8 shrink-0">
                                        {entry.photoURL && <AvatarImage src={entry.photoURL} alt="" />}
                                        <AvatarFallback className="bg-orange-100 text-xs font-bold text-orange-700">
                                            {entry.displayName.charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>

                                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                                        {entry.displayName}
                                    </span>

                                    <div className="shrink-0 text-right">
                                        <p className="text-sm font-black tabular-nums">
                                            ₹{(entry.spent ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                        </p>
                                        <p className="text-xs tabular-nums text-muted-foreground">
                                            {entry.orders} {entry.orders === 1 ? 'order' : 'orders'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Button variant="outline" className="w-full gap-2" onClick={downloadCSV}>
                        <Download className="h-4 w-4" />
                        Export CSV
                    </Button>
                </>
            )}
        </div>
    );
}
