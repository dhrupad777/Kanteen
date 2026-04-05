"use client";

import { useState, useEffect } from "react";
import {
    collection, query, where, onSnapshot, Timestamp,
    writeBatch, doc
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order } from "@/types";
import { format } from "date-fns";
import {
    Loader2, Trash2, AlertTriangle, ShieldAlert,
    CheckCircle2, X, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Statuses that are still "live" (not yet done / not already cancelled)
const PURGEABLE_STATUSES = ['PAID', 'Preparing', 'Ready'] as const;

function statusColor(status: string) {
    switch (status) {
        case 'PAID':      return "bg-blue-50 text-blue-700 border-blue-200";
        case 'Preparing': return "bg-orange-50 text-orange-700 border-orange-200";
        case 'Ready':     return "bg-emerald-50 text-emerald-700 border-emerald-200";
        default:          return "bg-gray-50 text-gray-600 border-gray-200";
    }
}

function toOrder(d: any): Order {
    const data = d.data() as Partial<Order>;
    return {
        ...data,
        id: d.id,
        createdAt: data.createdAt instanceof Timestamp
            ? data.createdAt.toDate()
            : new Date(data.createdAt as any),
    } as Order;
}

// ── Shared order card ────────────────────────────────────────────────────────
function OrderCard({
    order,
    isSelected,
    onToggle,
    showDate = false,
}: {
    order: Order;
    isSelected: boolean;
    onToggle: () => void;
    showDate?: boolean;
}) {
    const otpVerified = !!(order.otp?.verifiedAt);
    return (
        <div
            onClick={onToggle}
            className={cn(
                "bg-white rounded-xl border px-4 py-3 cursor-pointer transition-all select-none",
                isSelected
                    ? "border-red-400 ring-1 ring-red-300 bg-red-50"
                    : otpVerified
                        ? "border-slate-200 hover:border-slate-300"
                        : "border-amber-200 bg-amber-50/40 hover:border-amber-300"
            )}
        >
            <div className="flex items-center gap-3">
                {/* Checkbox */}
                <div className={cn(
                    "w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors",
                    isSelected ? "bg-red-500 border-red-500" : "border-slate-300"
                )}>
                    {isSelected && <X className="h-3 w-3 text-white" />}
                </div>

                {/* Token */}
                <span className="text-lg font-black text-slate-800 w-8 shrink-0">
                    #{order.token}
                </span>

                {/* Name + items */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">
                        {order.userName || order.userEmail || "Unknown"}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                        {order.items?.map(i => `${i.name}×${i.quantity}`).join(", ")}
                    </p>
                </div>

                {/* Right side */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1.5">
                        <Badge className={cn("text-[10px] px-1.5 py-0 border", statusColor(order.status))}>
                            {order.status}
                        </Badge>
                        {otpVerified ? (
                            <Badge className="text-[10px] px-1.5 py-0 bg-green-50 text-green-700 border border-green-200">
                                OTP ✓
                            </Badge>
                        ) : (
                            <Badge className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border border-amber-200 gap-0.5">
                                <AlertTriangle className="h-2.5 w-2.5" /> No OTP
                            </Badge>
                        )}
                    </div>
                    <span className="text-xs text-slate-400">
                        ₹{order.totalPrice} ·{" "}
                        {showDate
                            ? format(order.createdAt, "MMM d, h:mm a")
                            : format(order.createdAt, "h:mm a")}
                    </span>
                </div>
            </div>
        </div>
    );
}

// ── Shared toolbar + delete bar ──────────────────────────────────────────────
function Toolbar({
    orders,
    selected,
    onSelectUnverified,
    onSelectAll,
    onClear,
    label,
}: {
    orders: Order[];
    selected: Set<string>;
    onSelectUnverified: () => void;
    onSelectAll: () => void;
    onClear: () => void;
    label: string;
}) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={onSelectUnverified} className="text-xs border-slate-200">
                Select Unverified OTP
            </Button>
            <Button variant="outline" size="sm" onClick={onSelectAll} className="text-xs border-slate-200">
                Select All
            </Button>
            {selected.size > 0 && (
                <Button variant="ghost" size="sm" onClick={onClear} className="text-xs text-slate-500">
                    <X className="h-3 w-3 mr-1" /> Clear
                </Button>
            )}
            <span className="ml-auto text-xs text-slate-400">{label}</span>
        </div>
    );
}

// ── Batch delete helper ──────────────────────────────────────────────────────
async function batchDelete(ids: string[]): Promise<void> {
    const CHUNK = 200; // 2 deletes per order (orders + print_jobs) = 400 ops max per batch
    for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        for (const id of chunk) {
            batch.delete(doc(db, "orders", id));
            batch.delete(doc(db, "print_jobs", id));
        }
        // Throw on first failure — no silent partial deletes
        await batch.commit();
    }
}

// ── TODAY tab ────────────────────────────────────────────────────────────────
function TodayTab() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState(false);
    const [deletedCount, setDeletedCount] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    useEffect(() => {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const q = query(
            collection(db, "orders"),
            where("status", "in", [...PURGEABLE_STATUSES]),
            where("createdAt", ">=", Timestamp.fromDate(startOfToday))
        );

        const unsub = onSnapshot(q, (snap) => {
            const fetched = snap.docs.map(toOrder);
            fetched.sort((a, b) => {
                const av = !!(a.otp?.verifiedAt), bv = !!(b.otp?.verifiedAt);
                if (av !== bv) return av ? 1 : -1;
                return (a.token ?? 0) - (b.token ?? 0);
            });
            setOrders(fetched);
            setLoading(false);
        }, (err) => {
            setError('Failed to load orders: ' + (err.message ?? 'permission error'));
            setLoading(false);
        });

        return () => unsub();
    }, []);

    const toggle = (id: string) => setSelected(prev => {
        const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
    });

    async function handleDelete() {
        if (selected.size === 0) return;
        setDeleting(true); setError(null); setConfirmOpen(false);
        try {
            const ids = Array.from(selected);
            await batchDelete(ids);
            setDeletedCount(ids.length);
            setSelected(new Set());
        } catch (e: any) {
            setError(e?.message ?? "Delete failed. Please try again.");
        } finally {
            setDeleting(false);
        }
    }

    if (loading) return (
        <div className="flex justify-center items-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    return (
        <div className="space-y-4">
            {deletedCount !== null && (
                <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    <p className="text-sm font-semibold text-green-800">
                        {deletedCount} order{deletedCount !== 1 ? 's' : ''} permanently deleted.
                    </p>
                    <button className="ml-auto text-green-600 hover:text-green-800" onClick={() => setDeletedCount(null)}>
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}
            {error && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" />
                    <p className="text-sm font-semibold text-red-800">{error}</p>
                    <button className="ml-auto text-red-600" onClick={() => setError(null)}><X className="h-4 w-4" /></button>
                </div>
            )}

            {orders.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                    <CheckCircle2 className="h-12 w-12 mx-auto text-green-400 mb-3" />
                    <p className="font-semibold text-slate-700">No live orders today</p>
                    <p className="text-sm text-slate-400 mt-1">Nothing to clean up.</p>
                </div>
            ) : (
                <>
                    <Toolbar
                        orders={orders}
                        selected={selected}
                        onSelectUnverified={() => setSelected(new Set(orders.filter(o => !o.otp?.verifiedAt).map(o => o.id)))}
                        onSelectAll={() => setSelected(new Set(orders.map(o => o.id)))}
                        onClear={() => setSelected(new Set())}
                        label={`${orders.length} live order${orders.length !== 1 ? 's' : ''} today`}
                    />
                    <div className="space-y-2">
                        {orders.map(order => (
                            <OrderCard
                                key={order.id}
                                order={order}
                                isSelected={selected.has(order.id)}
                                onToggle={() => toggle(order.id)}
                            />
                        ))}
                    </div>
                </>
            )}

            {selected.size > 0 && (
                <DeleteBar
                    count={selected.size}
                    deleting={deleting}
                    onCancel={() => setSelected(new Set())}
                    onDelete={() => setConfirmOpen(true)}
                />
            )}

            {confirmOpen && (
                <ConfirmDialog
                    count={selected.size}
                    deleting={deleting}
                    onBack={() => setConfirmOpen(false)}
                    onConfirm={handleDelete}
                />
            )}
        </div>
    );
}

// ── UNCOLLECTED tab ──────────────────────────────────────────────────────────
function UncollectedTab() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState(false);
    const [deletedCount, setDeletedCount] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    useEffect(() => {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        // Orders from any past day that are still active (never completed/cancelled)
        const q = query(
            collection(db, "orders"),
            where("status", "in", [...PURGEABLE_STATUSES]),
            where("createdAt", "<", Timestamp.fromDate(startOfToday))
        );

        const unsub = onSnapshot(q, (snap) => {
            const fetched = snap.docs.map(toOrder);
            // Most recent date first, then by token within each date
            fetched.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            setOrders(fetched);
            setLoading(false);
        }, (err) => {
            setError('Failed to load orders: ' + (err.message ?? 'permission error'));
            setLoading(false);
        });

        return () => unsub();
    }, []);

    const toggle = (id: string) => setSelected(prev => {
        const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
    });

    async function handleDelete() {
        if (selected.size === 0) return;
        setDeleting(true); setError(null); setConfirmOpen(false);
        try {
            const ids = Array.from(selected);
            await batchDelete(ids);
            setDeletedCount(ids.length);
            setSelected(new Set());
        } catch (e: any) {
            setError(e?.message ?? "Delete failed. Please try again.");
        } finally {
            setDeleting(false);
        }
    }

    // Group orders by calendar date (YYYY-MM-DD), most recent first
    const grouped: { dateKey: string; label: string; orders: Order[] }[] = [];
    const dateMap = new Map<string, Order[]>();
    for (const o of orders) {
        const key = format(o.createdAt, 'yyyy-MM-dd');
        const existing = dateMap.get(key);
        if (existing) existing.push(o);
        else dateMap.set(key, [o]);
    }
    // dateMap is already in descending order because orders are sorted newest-first
    dateMap.forEach((dayOrders, key) => {
        grouped.push({
            dateKey: key,
            label: format(new Date(key + 'T00:00:00'), 'EEE, MMM d'),
            orders: dayOrders.sort((a, b) => (a.token ?? 0) - (b.token ?? 0)),
        });
    });

    if (loading) return (
        <div className="flex justify-center items-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    return (
        <div className="space-y-4">
            {deletedCount !== null && (
                <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    <p className="text-sm font-semibold text-green-800">
                        {deletedCount} order{deletedCount !== 1 ? 's' : ''} permanently deleted.
                    </p>
                    <button className="ml-auto text-green-600 hover:text-green-800" onClick={() => setDeletedCount(null)}>
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}
            {error && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" />
                    <p className="text-sm font-semibold text-red-800">{error}</p>
                    <button className="ml-auto text-red-600" onClick={() => setError(null)}><X className="h-4 w-4" /></button>
                </div>
            )}

            {orders.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                    <CheckCircle2 className="h-12 w-12 mx-auto text-green-400 mb-3" />
                    <p className="font-semibold text-slate-700">No uncollected orders</p>
                    <p className="text-sm text-slate-400 mt-1">All previous orders have been resolved.</p>
                </div>
            ) : (
                <>
                    <Toolbar
                        orders={orders}
                        selected={selected}
                        onSelectUnverified={() => setSelected(new Set(orders.filter(o => !o.otp?.verifiedAt).map(o => o.id)))}
                        onSelectAll={() => setSelected(new Set(orders.map(o => o.id)))}
                        onClear={() => setSelected(new Set())}
                        label={`${orders.length} uncollected order${orders.length !== 1 ? 's' : ''}`}
                    />

                    {/* Date-grouped list */}
                    <div className="space-y-4">
                        {grouped.map(({ dateKey, label, orders: dayOrders }) => (
                            <div key={dateKey}>
                                {/* Date header with "Select all in group" */}
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-3 py-1.5">
                                        <Clock className="h-3.5 w-3.5 text-slate-500" />
                                        <span className="text-xs font-bold text-slate-600">{label}</span>
                                        <span className="text-xs text-slate-400">· {dayOrders.length} order{dayOrders.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    <button
                                        className="text-xs text-slate-400 hover:text-red-500 transition-colors ml-auto"
                                        onClick={() => setSelected(prev => {
                                            const n = new Set(prev);
                                            dayOrders.forEach(o => n.add(o.id));
                                            return n;
                                        })}
                                    >
                                        Select all
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {dayOrders.map(order => (
                                        <OrderCard
                                            key={order.id}
                                            order={order}
                                            isSelected={selected.has(order.id)}
                                            onToggle={() => toggle(order.id)}
                                            showDate
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {selected.size > 0 && (
                <DeleteBar
                    count={selected.size}
                    deleting={deleting}
                    onCancel={() => setSelected(new Set())}
                    onDelete={() => setConfirmOpen(true)}
                />
            )}

            {confirmOpen && (
                <ConfirmDialog
                    count={selected.size}
                    deleting={deleting}
                    onBack={() => setConfirmOpen(false)}
                    onConfirm={handleDelete}
                />
            )}
        </div>
    );
}

// ── Shared delete bar + confirm dialog ───────────────────────────────────────
function DeleteBar({ count, deleting, onCancel, onDelete }: {
    count: number; deleting: boolean; onCancel: () => void; onDelete: () => void;
}) {
    return (
        <div className="sticky bottom-4 z-10">
            <div className="bg-red-600 text-white rounded-2xl shadow-xl px-5 py-3.5 flex items-center gap-3">
                <Trash2 className="h-5 w-5 shrink-0" />
                <div className="flex-1">
                    <p className="text-sm font-bold">{count} order{count !== 1 ? 's' : ''} selected</p>
                    <p className="text-xs text-red-200">Will be permanently deleted from all views</p>
                </div>
                <Button size="sm" variant="ghost" onClick={onCancel}
                    className="text-red-200 hover:text-white hover:bg-red-500 shrink-0">
                    Cancel
                </Button>
                <Button size="sm" onClick={onDelete} disabled={deleting}
                    className="bg-white text-red-600 hover:bg-red-50 font-bold shrink-0">
                    {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Delete
                </Button>
            </div>
        </div>
    );
}

function ConfirmDialog({ count, deleting, onBack, onConfirm }: {
    count: number; deleting: boolean; onBack: () => void; onConfirm: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="bg-red-100 p-3 rounded-full">
                        <AlertTriangle className="h-6 w-6 text-red-600" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">Permanently Delete?</h3>
                        <p className="text-sm text-slate-500">This cannot be undone.</p>
                    </div>
                </div>
                <p className="text-sm text-slate-600">
                    You are about to delete{" "}
                    <strong>{count} order{count !== 1 ? 's' : ''}</strong>{" "}
                    from orders, kitchen queue, and print queue. Students will no longer see these orders.
                </p>
                <div className="flex gap-3 pt-1">
                    <Button variant="outline" className="flex-1" onClick={onBack}>Go Back</Button>
                    <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={onConfirm} disabled={deleting}>
                        {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        Yes, Delete
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ── Main export ──────────────────────────────────────────────────────────────
export function OrderCleanup() {
    const [activeTab, setActiveTab] = useState<'today' | 'uncollected'>('today');

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-start gap-3">
                    <div className="bg-red-50 p-2 rounded-xl shrink-0 mt-0.5">
                        <Trash2 className="h-5 w-5 text-red-500" />
                    </div>
                    <div className="flex-1">
                        <h2 className="font-bold text-slate-800">Cancel Orders</h2>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Permanently removes orders from all views — student, kitchen, counter, and print queue.
                        </p>
                    </div>
                </div>

                {/* Tab switcher */}
                <div className="flex gap-1 mt-4 bg-slate-100 rounded-xl p-1">
                    <button
                        onClick={() => setActiveTab('today')}
                        className={cn(
                            "flex-1 text-sm font-semibold rounded-lg py-2 transition-all",
                            activeTab === 'today'
                                ? "bg-white text-slate-800 shadow-sm"
                                : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        Today
                    </button>
                    <button
                        onClick={() => setActiveTab('uncollected')}
                        className={cn(
                            "flex-1 text-sm font-semibold rounded-lg py-2 transition-all flex items-center justify-center gap-1.5",
                            activeTab === 'uncollected'
                                ? "bg-white text-amber-700 shadow-sm"
                                : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <Clock className="h-3.5 w-3.5" />
                        Uncollected
                    </button>
                </div>
            </div>

            {activeTab === 'today' ? <TodayTab /> : <UncollectedTab />}
        </div>
    );
}
