"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { checkManagerAllowlist } from "@/lib/auth";
import {
    collection, onSnapshot, writeBatch, doc, serverTimestamp, query, orderBy
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { MenuItem, MENU_CATEGORIES, MenuCategory } from "@/types/menu-item";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Loader2, Search, Save, ChevronDown, ChevronUp, AlertTriangle,
    CheckCircle2, Utensils, ArrowLeft, RotateCcw, Eye, EyeOff
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ─── Category icon chars for visual identity ─────────────────────────────────
const CATEGORY_EMOJI: Record<MenuCategory, string> = {
    tea_beverage: "☕",
    maggie:       "🍜",
    sandwich:     "🥪",
    dosa:         "🫓",
    uttapam:      "🍳",
    rava_dosa:    "🥞",
    paratha:      "🫓",
    chinese:      "🥡",
    sabji:        "🍲",
    indian_rice:  "🍚",
};

export default function ManagerDashboardPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const [items, setItems] = useState<MenuItem[]>([]);
    const [itemsLoading, setItemsLoading] = useState(true);

    // Map of itemId → new isAvailable value (only unsaved changes)
    const [pendingChanges, setPendingChanges] = useState<Map<string, boolean>>(new Map());
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Which category sections are expanded (default: all expanded)
    const [expandedSections, setExpandedSections] = useState<Set<string>>(
        new Set(MENU_CATEGORIES.map(c => c.value))
    );

    // ── Auth check ──────────────────────────────────────────────────────────
    useEffect(() => {
        async function verifyManager() {
            if (user && user.email) {
                const allowed = await checkManagerAllowlist(user.email);
                setIsAuthorized(allowed);
                if (!allowed) router.push("/");
            } else if (!authLoading) {
                setIsAuthorized(false);
                router.push("/manager");
            }
        }
        if (!authLoading) verifyManager();
    }, [user, authLoading, router]);

    // ── Real-time items from Firestore ──────────────────────────────────────
    useEffect(() => {
        if (!isAuthorized) return;

        const q = query(collection(db, "menu_items"), orderBy("sortOrder", "asc"));
        const unsub = onSnapshot(q, (snapshot) => {
            const fetched: MenuItem[] = [];
            snapshot.forEach((d) => {
                const data = d.data();
                fetched.push({
                    id: d.id,
                    name: data.name,
                    price: data.price,
                    category: data.category,
                    isActive: data.isActive,
                    isAvailable: data.isAvailable,
                    sortOrder: data.sortOrder,
                    tags: data.tags || [],
                    updatedAt: data.updatedAt,
                });
            });
            setItems(fetched);
            setItemsLoading(false);
        });

        return () => unsub();
    }, [isAuthorized]);

    // ── Derived: effective availability (pending overrides DB) ──────────────
    const getEffective = useCallback((item: MenuItem): boolean => {
        const pending = pendingChanges.get(item.id);
        return pending !== undefined ? pending : item.isAvailable;
    }, [pendingChanges]);

    // ── Grouped by category (only active items) ─────────────────────────────
    const groupedItems = useMemo(() => {
        return MENU_CATEGORIES.reduce((acc, cat) => {
            acc[cat.value] = items.filter(i => i.category === cat.value && i.isActive);
            return acc;
        }, {} as Record<MenuCategory, MenuItem[]>);
    }, [items]);

    // ── Stats ────────────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const active = items.filter(i => i.isActive);
        const available = active.filter(i => getEffective(i));
        return {
            total: active.length,
            available: available.length,
            unavailable: active.length - available.length,
        };
    }, [items, getEffective]);

    // ── Search results ───────────────────────────────────────────────────────
    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase();
        return items.filter(i => i.isActive && i.name.toLowerCase().includes(q));
    }, [items, searchQuery]);

    // ── Toggle single item ───────────────────────────────────────────────────
    const toggleItem = (item: MenuItem) => {
        const newVal = !getEffective(item);
        setPendingChanges(prev => {
            const next = new Map(prev);
            // If new value matches DB, no pending change needed
            if (newVal === item.isAvailable) {
                next.delete(item.id);
            } else {
                next.set(item.id, newVal);
            }
            return next;
        });
    };

    // ── Toggle entire section ────────────────────────────────────────────────
    const toggleSection = (category: MenuCategory) => {
        const sectionItems = groupedItems[category] || [];
        const allAvailable = sectionItems.every(i => getEffective(i));
        const newVal = !allAvailable; // flip: if all available → make all unavailable, and vice-versa

        setPendingChanges(prev => {
            const next = new Map(prev);
            sectionItems.forEach(item => {
                if (newVal === item.isAvailable) {
                    next.delete(item.id);
                } else {
                    next.set(item.id, newVal);
                }
            });
            return next;
        });
    };

    // ── Expand / collapse a section ──────────────────────────────────────────
    const toggleExpanded = (category: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(category)) next.delete(category);
            else next.add(category);
            return next;
        });
    };

    // ── Batch-save all pending changes ───────────────────────────────────────
    const saveChanges = async () => {
        if (pendingChanges.size === 0) return;
        setSaving(true);
        try {
            const batch = writeBatch(db);
            pendingChanges.forEach((isAvailable, itemId) => {
                batch.update(doc(db, "menu_items", itemId), {
                    isAvailable,
                    updatedAt: serverTimestamp(),
                });
            });
            await batch.commit();
            const count = pendingChanges.size;
            setPendingChanges(new Map());
            toast({
                title: "Changes saved!",
                description: `Updated availability for ${count} item${count > 1 ? "s" : ""}.`,
            });
        } catch (err: any) {
            toast({
                title: "Failed to save",
                description: err.message || "Something went wrong.",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    // ── Reset all pending changes ────────────────────────────────────────────
    const resetChanges = () => {
        setPendingChanges(new Map());
    };

    // ── Loading / auth states ────────────────────────────────────────────────
    if (authLoading || isAuthorized === null) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    const hasPendingChanges = pendingChanges.size > 0;

    // ── Helper: section header availability state ────────────────────────────
    const getSectionState = (category: MenuCategory) => {
        const sectionItems = groupedItems[category] || [];
        if (sectionItems.length === 0) return "empty";
        const availableCount = sectionItems.filter(i => getEffective(i)).length;
        if (availableCount === sectionItems.length) return "all";
        if (availableCount === 0) return "none";
        return "partial";
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ── Top Header ───────────────────────────────────────────────── */}
            <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
                <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <Link
                            href="/kitchen"
                            className="flex items-center gap-1.5 text-gray-500 hover:text-primary transition-colors shrink-0"
                        >
                            <ArrowLeft className="h-5 w-5" />
                            <span className="text-sm font-medium hidden sm:inline">Kitchen</span>
                        </Link>
                        <div className="h-5 w-px bg-gray-200 hidden sm:block" />
                        <div className="min-w-0">
                            <h1 className="text-base sm:text-lg font-bold text-gray-900 leading-tight truncate">
                                Availability Manager
                            </h1>
                            <p className="text-xs text-gray-400 hidden sm:block">
                                Toggle items & confirm changes
                            </p>
                        </div>
                    </div>

                    {/* Live stats pill */}
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-50 text-green-700 rounded-full px-2.5 py-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
                            {stats.available}
                        </span>
                        {stats.unavailable > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium bg-red-50 text-red-700 rounded-full px-2.5 py-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />
                                {stats.unavailable}
                            </span>
                        )}
                    </div>
                </div>
            </header>

            {/* ── Main Content ─────────────────────────────────────────────── */}
            <main className="max-w-3xl mx-auto px-3 sm:px-4 py-4 pb-32">
                {/* Pending-changes banner */}
                {hasPendingChanges && (
                    <div className="mb-4 flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                        <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                        <p className="text-sm font-medium text-orange-700 flex-1">
                            {pendingChanges.size} unsaved change{pendingChanges.size > 1 ? "s" : ""} — confirm below to apply
                        </p>
                    </div>
                )}

                {/* Search */}
                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <Input
                        placeholder="Search items..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9 h-10 rounded-xl bg-white border-gray-200 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            ✕
                        </button>
                    )}
                </div>

                {/* Loading skeleton */}
                {itemsLoading && (
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
                                <div className="h-5 w-32 bg-gray-200 rounded mb-3" />
                                <div className="space-y-2">
                                    <div className="h-10 bg-gray-100 rounded-xl" />
                                    <div className="h-10 bg-gray-100 rounded-xl" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Search results view */}
                {!itemsLoading && searchQuery && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-700">
                                Results ({searchResults.length})
                            </span>
                        </div>
                        {searchResults.length === 0 ? (
                            <div className="px-4 py-8 text-center text-gray-400 text-sm">
                                No items match "{searchQuery}"
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-50">
                                {searchResults.map(item => (
                                    <ItemRow
                                        key={item.id}
                                        item={item}
                                        effective={getEffective(item)}
                                        isPending={pendingChanges.has(item.id)}
                                        onToggle={() => toggleItem(item)}
                                    />
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {/* Category sections */}
                {!itemsLoading && !searchQuery && (
                    <div className="space-y-3">
                        {MENU_CATEGORIES.map(cat => {
                            const sectionItems = groupedItems[cat.value] || [];
                            if (sectionItems.length === 0) return null;

                            const isExpanded = expandedSections.has(cat.value);
                            const state = getSectionState(cat.value);
                            const sectionAvailable = state === "all";
                            const pendingInSection = sectionItems.filter(i => pendingChanges.has(i.id)).length;

                            return (
                                <div
                                    key={cat.value}
                                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                                >
                                    {/* Section header */}
                                    <div className={cn(
                                        "px-4 py-3.5 flex items-center gap-3",
                                        "border-b",
                                        isExpanded ? "border-gray-100" : "border-transparent"
                                    )}>
                                        {/* Expand toggle + title */}
                                        <button
                                            onClick={() => toggleExpanded(cat.value)}
                                            className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                                        >
                                            <span className="text-xl leading-none select-none" aria-hidden>
                                                {CATEGORY_EMOJI[cat.value]}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={cn(
                                                        "font-semibold text-sm leading-tight",
                                                        state === "none" ? "text-gray-400" : "text-gray-800"
                                                    )}>
                                                        {cat.label}
                                                    </span>
                                                    <span className="text-xs text-gray-400 font-normal">
                                                        {sectionItems.filter(i => getEffective(i)).length}/{sectionItems.length}
                                                    </span>
                                                    {pendingInSection > 0 && (
                                                        <Badge className="h-4 text-xs bg-orange-100 text-orange-700 border-0 px-1.5 py-0">
                                                            {pendingInSection} pending
                                                        </Badge>
                                                    )}
                                                    {state === "none" && (
                                                        <Badge className="h-4 text-xs bg-red-100 text-red-600 border-0 px-1.5 py-0">
                                                            Section Off
                                                        </Badge>
                                                    )}
                                                    {state === "partial" && (
                                                        <Badge className="h-4 text-xs bg-yellow-100 text-yellow-700 border-0 px-1.5 py-0">
                                                            Partial
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-gray-400 shrink-0">
                                                {isExpanded
                                                    ? <ChevronUp className="h-4 w-4" />
                                                    : <ChevronDown className="h-4 w-4" />
                                                }
                                            </span>
                                        </button>

                                        {/* Section-level toggle */}
                                        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                                            <span className="text-[11px] font-medium text-gray-400 hidden sm:inline">
                                                {sectionAvailable ? "All on" : "All off"}
                                            </span>
                                            <Switch
                                                checked={sectionAvailable}
                                                onCheckedChange={() => toggleSection(cat.value)}
                                                className={cn(
                                                    "data-[state=checked]:bg-primary",
                                                    state === "partial" && "data-[state=unchecked]:bg-yellow-400"
                                                )}
                                            />
                                        </div>
                                    </div>

                                    {/* Item list */}
                                    {isExpanded && (
                                        <ul className="divide-y divide-gray-50">
                                            {sectionItems.map(item => (
                                                <ItemRow
                                                    key={item.id}
                                                    item={item}
                                                    effective={getEffective(item)}
                                                    isPending={pendingChanges.has(item.id)}
                                                    onToggle={() => toggleItem(item)}
                                                />
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* ── Sticky Confirm Bar ────────────────────────────────────────── */}
            <div className={cn(
                "fixed bottom-0 left-0 right-0 z-50 transition-all duration-300",
                hasPendingChanges ? "translate-y-0" : "translate-y-full"
            )}>
                {/* Safe-area background */}
                <div className="bg-white border-t border-gray-200 shadow-2xl shadow-black/10">
                    <div className="max-w-3xl mx-auto px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                        <div className="flex items-center gap-3">
                            {/* Summary */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 leading-tight">
                                    {pendingChanges.size} change{pendingChanges.size > 1 ? "s" : ""} pending
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {Array.from(pendingChanges.values()).filter(v => !v).length} items going offline,{" "}
                                    {Array.from(pendingChanges.values()).filter(v => v).length} going online
                                </p>
                            </div>

                            {/* Reset */}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={resetChanges}
                                disabled={saving}
                                className="shrink-0 rounded-xl border-gray-200 h-10 text-xs"
                            >
                                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                                Reset
                            </Button>

                            {/* Confirm */}
                            <Button
                                size="sm"
                                onClick={saveChanges}
                                disabled={saving}
                                className={cn(
                                    "shrink-0 rounded-xl h-10 text-sm font-semibold",
                                    "bg-primary hover:bg-primary/90 text-white shadow-sm shadow-orange-200"
                                )}
                            >
                                {saving ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <Save className="h-4 w-4 mr-2" />
                                )}
                                {saving ? "Saving..." : `Confirm ${pendingChanges.size} Change${pendingChanges.size > 1 ? "s" : ""}`}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Item Row Component ───────────────────────────────────────────────────────
function ItemRow({
    item,
    effective,
    isPending,
    onToggle,
}: {
    item: MenuItem;
    effective: boolean;
    isPending: boolean;
    onToggle: () => void;
}) {
    return (
        <li className={cn(
            "flex items-center gap-3 px-4 py-3 transition-colors",
            !effective && "bg-gray-50/60",
            isPending && "bg-orange-50/40"
        )}>
            {/* Availability dot */}
            <span className={cn(
                "h-2 w-2 rounded-full shrink-0 mt-0.5",
                effective ? "bg-green-400" : "bg-gray-300"
            )} />

            {/* Name + price */}
            <div className="flex-1 min-w-0">
                <span className={cn(
                    "text-sm font-medium leading-tight block truncate",
                    effective ? "text-gray-800" : "text-gray-400 line-through"
                )}>
                    {item.name}
                </span>
                <span className="text-xs text-gray-400 mt-0.5 block">
                    ₹{item.price}
                    {isPending && (
                        <span className="ml-2 text-orange-500 font-medium no-underline" style={{ textDecoration: "none" }}>
                            • unsaved
                        </span>
                    )}
                </span>
            </div>

            {/* Toggle */}
            <Switch
                checked={effective}
                onCheckedChange={onToggle}
                className="data-[state=checked]:bg-primary shrink-0"
                aria-label={`Toggle ${item.name}`}
            />
        </li>
    );
}
