"use client";

import { useState, useEffect, useMemo } from "react";
import { addMonths, format } from "date-fns";
import { Loader2, Search, Users, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { OrderRow } from "@/components/order-row";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { StudentDirectoryEntry, StudentDirectoryResponse } from "@/types";

/**
 * Owner-only student lookup: search a student, see that month's order history.
 *
 * The whole month (~130KB) arrives in one request, so search is a plain useMemo
 * filter — no debounce, no per-keystroke fetching.
 */

function currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

export function StudentsManager() {
    const { user } = useAuth();
    const [month, setMonth] = useState(currentMonth);
    const [data, setData] = useState<StudentDirectoryResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [expandedUid, setExpandedUid] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        let active = true;
        setLoading(true);
        setError(null);
        setExpandedUid(null);

        (async () => {
            try {
                const token = await user.getIdToken();
                const res = await fetch(`/api/staff/students?month=${month}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error(`Request failed: ${res.status}`);
                const json = (await res.json()) as StudentDirectoryResponse;
                if (!active) return;
                setData(json);
            } catch {
                if (!active) return;
                setError("Could not load students.");
            } finally {
                if (active) setLoading(false);
            }
        })();

        return () => { active = false; };
    }, [user, month]);

    const monthDate = new Date(`${month}-01T00:00:00`);
    const monthLabel = format(monthDate, 'MMMM yyyy');
    const isCurrentMonth = month === currentMonth();
    const all = data?.students ?? [];

    // Empty search shows only students who ordered this month — the useful
    // default. Typing widens to every registered student, so someone who didn't
    // order is still found rather than looking like a broken search.
    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return all.filter((s) => s.orderCount > 0);
        return all.filter((s) =>
            s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
    }, [all, search]);

    const activeCount = all.filter((s) => s.orderCount > 0).length;

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-black tracking-tight">Students</h3>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Search • Month History
                </p>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Previous month"
                    onClick={() => setMonth(format(addMonths(monthDate, -1), 'yyyy-MM'))}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-black tracking-tight">{monthLabel}</span>
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

            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    aria-label="Search students"
                    className="pl-9"
                />
            </div>

            {loading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : error ? (
                <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{error}</CardContent></Card>
            ) : (
                <>
                    <p className="text-xs text-muted-foreground">
                        {search.trim()
                            ? `${visible.length} of ${all.length} registered students`
                            : `${activeCount} student${activeCount === 1 ? '' : 's'} ordered in ${monthLabel} — search to find anyone else`}
                    </p>

                    {visible.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
                                <Users className="h-8 w-8 text-slate-300" />
                                <p className="text-sm text-muted-foreground">
                                    {search.trim()
                                        ? `No student matches "${search.trim()}".`
                                        : `No orders in ${monthLabel}.`}
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-2">
                            {visible.map((student) => (
                                <StudentCard
                                    key={student.uid}
                                    student={student}
                                    monthLabel={monthLabel}
                                    expanded={expandedUid === student.uid}
                                    onToggle={() => setExpandedUid(expandedUid === student.uid ? null : student.uid)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

interface StudentCardProps {
    student: StudentDirectoryEntry;
    monthLabel: string;
    expanded: boolean;
    onToggle: () => void;
}

function StudentCard({ student, monthLabel, expanded, onToggle }: StudentCardProps) {
    const hasOrders = student.orderCount > 0;

    return (
        <Card className="overflow-hidden">
            <button
                onClick={onToggle}
                aria-expanded={expanded}
                className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-slate-50"
            >
                <Avatar className="h-9 w-9 shrink-0">
                    {student.photoURL && <AvatarImage src={student.photoURL} alt="" />}
                    <AvatarFallback className="bg-orange-100 text-xs font-bold text-orange-700">
                        {student.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{student.name}</p>
                    {student.email && (
                        <p className="truncate text-xs text-muted-foreground">{student.email}</p>
                    )}
                </div>

                <div className="shrink-0 text-right">
                    {hasOrders ? (
                        <>
                            <p className="text-sm font-black tabular-nums">
                                ₹{student.spent.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs tabular-nums text-muted-foreground">
                                {student.orderCount} {student.orderCount === 1 ? 'order' : 'orders'}
                            </p>
                        </>
                    ) : (
                        <p className="text-xs text-muted-foreground">No orders</p>
                    )}
                </div>

                {hasOrders && (
                    <ChevronDown className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        expanded && "rotate-180",
                    )} />
                )}
            </button>

            {expanded && (
                <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 p-4">
                    {hasOrders ? (
                        student.orders.map((order) => (
                            <OrderRow key={order.id} order={order} showName={false} />
                        ))
                    ) : (
                        <p className="text-sm text-muted-foreground">No orders in {monthLabel}.</p>
                    )}
                </div>
            )}
        </Card>
    );
}
