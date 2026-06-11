"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useStaffAuth } from "@/hooks/use-staff-auth";
import {
    collection, onSnapshot, writeBatch, doc, setDoc, serverTimestamp, query, orderBy
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { MenuItem, MENU_CATEGORIES, MenuCategory } from "@/types/menu-item";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Loader2, Search, Save, ChevronDown, ChevronUp, AlertTriangle,
    ArrowLeft, RotateCcw, LogOut, Power, Trash2, Clock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { MenuManager } from "@/components/menu-manager";
import { MenuCatalogEditor } from "@/components/menu-catalog-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrderTracker } from "@/components/order-tracker";
import { OrderCleanup } from "@/components/order-cleanup";

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
    daily_menu:   "🍽️",
    daily_regulars: "🍛",
};

export default function CounterPage() {
    const { loading: authLoading, isAuthenticated, signOutStaff } = useStaffAuth();
    const { toast } = useToast();

    const [items, setItems] = useState<MenuItem[]>([]);
    const [itemsLoading, setItemsLoading] = useState(true);

    // Online ordering toggle (controls /student page)
    const [kitchenActive, setKitchenActive] = useState(true);
    const [togglingKitchen, setTogglingKitchen] = useState(false);
    // 24/7 override — when ON, the 8:00 AM – 8:45 PM gate is bypassed
    const [kitchen24x7, setKitchen24x7] = useState(false);
    const [toggling24x7, setToggling24x7] = useState(false);

    useEffect(() => {
        const unsub = onSnapshot(
            doc(db, 'canteen_state', 'settings'),
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    setKitchenActive(data.studentOrderingEnabled !== false);
                    setKitchen24x7(data.kitchen24x7 === true);
                } else {
                    setKitchenActive(true);
                    setKitchen24x7(false);
                }
            },
            () => { /* keep current state on error — counter toggle still works via setDoc */ },
        );
        return () => unsub();
    }, []);

    const toggleKitchen = async () => {
        setTogglingKitchen(true);
        const next = !kitchenActive;
        try {
            await setDoc(doc(db, 'canteen_state', 'settings'), {
                studentOrderingEnabled: next,
                updatedAt: serverTimestamp(),
            }, { merge: true });
            toast({
                title: next ? 'Online Ordering Resumed' : 'Online Ordering Paused',
                description: next ? 'Students can now place orders.' : 'Student ordering is now disabled.',
            });
        } catch {
            toast({ title: 'Failed to update', variant: 'destructive' });
        } finally {
            setTogglingKitchen(false);
        }
    };

    const toggle24x7 = async () => {
        setToggling24x7(true);
        const next = !kitchen24x7;
        try {
            await setDoc(doc(db, 'canteen_state', 'settings'), {
                kitchen24x7: next,
                updatedAt: serverTimestamp(),
            }, { merge: true });
            toast({
                title: next ? 'Kitchen open 24/7' : 'Kitchen hours restored',
                description: next
                    ? 'Students can order at any time.'
                    : 'Ordering limited to 8:00 AM – 8:45 PM.',
            });
        } catch {
            toast({ title: 'Failed to update', variant: 'destructive' });
        } finally {
            setToggling24x7(false);
        }
    };

    const [pendingChanges, setPendingChanges] = useState<Map<string, boolean>>(new Map());
    const [priceChanges, setPriceChanges] = useState<Map<string, number>>(new Map());
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Default all sections collapsed
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!isAuthenticated) return;

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
    }, [isAuthenticated]);

    const getEffective = useCallback((item: MenuItem): boolean => {
        const pending = pendingChanges.get(item.id);
        return pending !== undefined ? pending : item.isAvailable;
    }, [pendingChanges]);

    const getEffectivePrice = useCallback((item: MenuItem): number => {
        const pending = priceChanges.get(item.id);
        return pending !== undefined ? pending : item.price;
    }, [priceChanges]);

    const groupedItems = useMemo(() => {
        return MENU_CATEGORIES.reduce((acc, cat) => {
            acc[cat.value] = items.filter(i => i.category === cat.value && i.isActive);
            return acc;
        }, {} as Record<MenuCategory, MenuItem[]>);
    }, [items]);

    const stats = useMemo(() => {
        const active = items.filter(i => i.isActive);
        const available = active.filter(i => getEffective(i));
        return {
            total: active.length,
            available: available.length,
            unavailable: active.length - available.length,
        };
    }, [items, getEffective]);

    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase();
        return items.filter(i => i.isActive && i.name.toLowerCase().includes(q));
    }, [items, searchQuery]);

    const toggleItem = (item: MenuItem) => {
        const newVal = !getEffective(item);
        setPendingChanges(prev => {
            const next = new Map(prev);
            if (newVal === item.isAvailable) {
                next.delete(item.id);
            } else {
                next.set(item.id, newVal);
            }
            return next;
        });
    };

    const toggleSection = (category: MenuCategory) => {
        const sectionItems = groupedItems[category] || [];
        const allAvailable = sectionItems.every(i => getEffective(i));
        const newVal = !allAvailable;

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

    const handlePriceChange = (item: MenuItem, newPrice: number) => {
        if (isNaN(newPrice) || newPrice < 0) return;
        setPriceChanges(prev => {
            const next = new Map(prev);
            if (newPrice === item.price) {
                next.delete(item.id);
            } else {
                next.set(item.id, newPrice);
            }
            return next;
        });
    };

    const toggleExpanded = (category: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(category)) next.delete(category);
            else next.add(category);
            return next;
        });
    };

    const saveChanges = async () => {
        if (pendingChanges.size === 0 && priceChanges.size === 0) return;
        setSaving(true);
        try {
            const batch = writeBatch(db);
            const allAlteredIds = new Set([...pendingChanges.keys(), ...priceChanges.keys()]);

            allAlteredIds.forEach((itemId) => {
                const updateData: any = { updatedAt: serverTimestamp() };
                if (pendingChanges.has(itemId)) {
                    updateData.isAvailable = pendingChanges.get(itemId);
                }
                if (priceChanges.has(itemId)) {
                    updateData.price = priceChanges.get(itemId);
                }
                batch.update(doc(db, "menu_items", itemId), updateData);
            });

            await batch.commit();
            const count = allAlteredIds.size;
            setPendingChanges(new Map());
            setPriceChanges(new Map());
            toast({
                title: "Changes saved!",
                description: `Updated ${count} item${count > 1 ? "s" : ""}.`,
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

    const resetChanges = () => {
        setPendingChanges(new Map());
        setPriceChanges(new Map());
    };

    if (authLoading || !isAuthenticated) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    const hasAnyPendingChanges = pendingChanges.size > 0 || priceChanges.size > 0;

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
                                Daily Menu Counter
                            </h1>
                            <p className="text-xs text-gray-400 hidden sm:block">
                                Toggle items &amp; confirm changes
                            </p>
                        </div>
                    </div>

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
                        {/* Online ordering toggle */}
                        <button
                            onClick={toggleKitchen}
                            disabled={togglingKitchen}
                            title={kitchenActive ? 'Pause online ordering' : 'Resume online ordering'}
                            className={cn(
                                "inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 border transition-all",
                                kitchenActive
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                    : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                            )}
                        >
                            {togglingKitchen
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Power className="h-3 w-3" />
                            }
                            <span className="hidden sm:inline">{kitchenActive ? 'Online: Active' : 'Online: Off'}</span>
                        </button>
                        {/* 24/7 override toggle */}
                        <button
                            onClick={toggle24x7}
                            disabled={toggling24x7}
                            title={kitchen24x7 ? 'Limit ordering to 8:00 AM – 8:45 PM' : 'Open kitchen 24/7 (bypass hours)'}
                            className={cn(
                                "inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 border transition-all",
                                kitchen24x7
                                    ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                                    : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                            )}
                        >
                            {toggling24x7
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Clock className="h-3 w-3" />
                            }
                            <span className="hidden sm:inline">{kitchen24x7 ? '24/7' : '8–8:45'}</span>
                        </button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={signOutStaff}
                            title="Sign out"
                            className="h-8 w-8 text-gray-400 hover:text-destructive"
                        >
                            <LogOut className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-3 sm:px-4 py-4 pb-32">
                <Tabs defaultValue="management" className="w-full">
                    <TabsList className="grid w-full grid-cols-4 bg-gray-200/50 p-1 mb-6 rounded-xl">
                        <TabsTrigger value="management" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm text-xs sm:text-sm">Counter</TabsTrigger>
                        <TabsTrigger value="catalog" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm text-xs sm:text-sm">Menu Items</TabsTrigger>
                        <TabsTrigger value="tracker" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm text-xs sm:text-sm">Tracker</TabsTrigger>
                        <TabsTrigger value="cleanup" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-red-600 data-[state=active]:shadow-sm text-xs sm:text-sm gap-1">
                            <Trash2 className="h-3.5 w-3.5" />Cancel
                        </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="management" className="m-0 space-y-4">
                        {/* Daily Menu (what's cooking today) */}
                        <div className="mb-6">
                            <MenuManager />
                        </div>

                <div className="mb-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-200" />
                    <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Item Availability</span>
                    <div className="h-px flex-1 bg-gray-200" />
                </div>

                {hasAnyPendingChanges && (
                    <div className="mb-4 flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                        <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                        <p className="text-sm font-medium text-orange-700 flex-1">
                            {pendingChanges.size + priceChanges.size} unsaved change{pendingChanges.size + priceChanges.size > 1 ? "s" : ""} — confirm below to apply
                        </p>
                    </div>
                )}

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

                {!itemsLoading && searchQuery && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-700">
                                Results ({searchResults.length})
                            </span>
                        </div>
                        {searchResults.length === 0 ? (
                            <div className="px-4 py-8 text-center text-gray-400 text-sm">
                                No items match &quot;{searchQuery}&quot;
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-50">
                                {searchResults.map(item => (
                                    <ItemRow
                                        key={item.id}
                                        item={item}
                                        effective={getEffective(item)}
                                        effectivePrice={getEffectivePrice(item)}
                                        isPending={pendingChanges.has(item.id)}
                                        isPricePending={priceChanges.has(item.id)}
                                        onToggle={() => toggleItem(item)}
                                        onPriceChange={(val) => handlePriceChange(item, val)}
                                    />
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {!itemsLoading && !searchQuery && (
                    <div className="space-y-3">
                        {MENU_CATEGORIES.map(cat => {
                            const sectionItems = groupedItems[cat.value] || [];
                            if (sectionItems.length === 0) return null;

                            const isExpanded = expandedSections.has(cat.value);
                            const state = getSectionState(cat.value);
                            const sectionAvailable = state === "all";
                            const pendingInSection = sectionItems.filter(i => pendingChanges.has(i.id) || priceChanges.has(i.id)).length;

                            return (
                                <div
                                    key={cat.value}
                                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                                >
                                    <div className={cn(
                                        "px-4 py-3.5 flex items-center gap-3",
                                        "border-b",
                                        isExpanded ? "border-gray-100" : "border-transparent"
                                    )}>
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
                                                        <Badge className="h-4 text-[10px] bg-orange-100 text-orange-700 border-0 px-1.5 py-0">
                                                            {pendingInSection} pending
                                                        </Badge>
                                                    )}
                                                    {state === "none" && (
                                                        <Badge className="h-4 text-[10px] bg-red-100 text-red-600 border-0 px-1.5 py-0">
                                                            Section Off
                                                        </Badge>
                                                    )}
                                                    {state === "partial" && (
                                                        <Badge className="h-4 text-[10px] bg-yellow-100 text-yellow-700 border-0 px-1.5 py-0">
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

                                    {isExpanded && (
                                        <ul className="divide-y divide-gray-50">
                                            {sectionItems.map(item => (
                                                <ItemRow
                                                    key={item.id}
                                                    item={item}
                                                    effective={getEffective(item)}
                                                    effectivePrice={getEffectivePrice(item)}
                                                    isPending={pendingChanges.has(item.id)}
                                                    isPricePending={priceChanges.has(item.id)}
                                                    onToggle={() => toggleItem(item)}
                                                    onPriceChange={(val) => handlePriceChange(item, val)}
                                                />
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                    </TabsContent>
                    <TabsContent value="catalog" className="m-0">
                        <MenuCatalogEditor />
                    </TabsContent>
                    <TabsContent value="tracker" className="m-0">
                        <OrderTracker />
                    </TabsContent>
                    <TabsContent value="cleanup" className="m-0">
                        <OrderCleanup />
                    </TabsContent>
                </Tabs>
            </main>

            <div className={cn(
                "fixed bottom-0 left-0 right-0 z-50 transition-all duration-300",
                hasAnyPendingChanges ? "translate-y-0" : "translate-y-full"
            )}>
                <div className="bg-white border-t border-gray-200 shadow-2xl shadow-black/10">
                    <div className="max-w-3xl mx-auto px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                        <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 leading-tight">
                                    {pendingChanges.size + priceChanges.size} change{pendingChanges.size + priceChanges.size > 1 ? "s" : ""} pending
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {Array.from(pendingChanges.values()).filter(v => !v).length} items offline,{" "}
                                    {Array.from(pendingChanges.values()).filter(v => v).length} online,{" "}
                                    {priceChanges.size} price updates
                                </p>
                            </div>

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
                                {saving ? "Saving..." : `Confirm ${pendingChanges.size + priceChanges.size} Change${pendingChanges.size + priceChanges.size > 1 ? "s" : ""}`}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ItemRow({
    item,
    effective,
    effectivePrice,
    isPending,
    isPricePending,
    onToggle,
    onPriceChange,
}: {
    item: MenuItem;
    effective: boolean;
    effectivePrice: number;
    isPending: boolean;
    isPricePending: boolean;
    onToggle: () => void;
    onPriceChange: (val: number) => void;
}) {
    const isDynamicSide = ['Papad', 'Sweet', 'Salad'].includes(item.name);

    return (
        <li className={cn(
            "flex items-center gap-3 px-4 py-3 transition-colors",
            !effective && "bg-gray-50/60",
            (isPending || isPricePending) && "bg-orange-50/40"
        )}>
            <span className={cn(
                "h-2 w-2 rounded-full shrink-0 mt-0.5",
                effective ? "bg-green-400" : "bg-gray-300"
            )} />

            <div className="flex-1 min-w-0 flex items-center justify-between">
                <div>
                    <span className={cn(
                        "text-sm font-medium leading-tight block truncate",
                        effective ? "text-gray-800" : "text-gray-400 line-through"
                    )}>
                        {item.name}
                    </span>
                    <span className="text-xs text-gray-400 mt-0.5 block flex items-center gap-2">
                        {isDynamicSide ? (
                             <div className="relative inline-flex items-center">
                                 <span className="absolute left-1.5 text-[10px] text-gray-400">₹</span>
                                 <Input 
                                    type="number" 
                                    value={effectivePrice} 
                                    onChange={(e) => onPriceChange(parseFloat(e.target.value) || 0)}
                                    className="h-6 w-16 pl-4 pr-1 py-0 text-xs shadow-none border-gray-200"
                                    min="0"
                                    step="1"
                                 />
                             </div>
                        ) : (
                            <span>₹{item.price}</span>
                        )}
                        
                        {(isPending || isPricePending) && (
                            <span className="text-orange-500 font-medium no-underline" style={{ textDecoration: "none" }}>
                                • unsaved
                            </span>
                        )}
                    </span>
                </div>
            </div>

            <Switch
                checked={effective}
                onCheckedChange={onToggle}
                className="data-[state=checked]:bg-primary shrink-0"
                aria-label={`Toggle ${item.name}`}
            />
        </li>
    );
}
