"use client";

import { useState, useEffect, useMemo } from "react";
import {
    collection, onSnapshot, writeBatch, doc, addDoc,
    serverTimestamp, query, orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { MenuItem, MENU_CATEGORIES, MenuCategory } from "@/types/menu-item";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Plus, Save, RotateCcw, Loader2, ChevronDown, ChevronUp,
    Pencil, Check, X, AlertTriangle, PackagePlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Fields the editor can change on an existing item
interface PendingEdit {
    name?: string;
    price?: number;
    parcelCharge?: number;
    isActive?: boolean;
}

interface NewItemDraft {
    name: string;
    price: string;
    parcelCharge: string;
    category: MenuCategory;
}

const BLANK_DRAFT: NewItemDraft = {
    name: "",
    price: "",
    parcelCharge: "",
    category: "tea_beverage",
};

const CATEGORY_EMOJI: Record<MenuCategory, string> = {
    tea_beverage: "☕",
    maggie: "🍜",
    sandwich: "🥪",
    dosa: "🫓",
    uttapam: "🍳",
    rava_dosa: "🥞",
    paratha: "🫓",
    chinese: "🥡",
    sabji: "🍲",
    indian_rice: "🍚",
    daily_menu: "🍽️",
    daily_regulars: "🍛",
};

export function MenuCatalogEditor() {
    const { toast } = useToast();
    const [items, setItems] = useState<MenuItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [adding, setAdding] = useState(false);

    // Map of itemId → pending edits (not yet saved to Firestore)
    const [pendingEdits, setPendingEdits] = useState<Map<string, PendingEdit>>(new Map());

    // Which item is in inline-edit mode
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState<{ name: string; price: string; parcelCharge: string }>({
        name: "", price: "", parcelCharge: "",
    });

    // New item form
    const [showAddForm, setShowAddForm] = useState(false);
    const [newDraft, setNewDraft] = useState<NewItemDraft>(BLANK_DRAFT);

    // Expanded sections
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

    useEffect(() => {
        const q = query(collection(db, "menu_items"), orderBy("sortOrder", "asc"));
        const unsub = onSnapshot(
            q,
            (snap) => {
                const fetched: MenuItem[] = snap.docs.map((d) => {
                    const data = d.data();
                    return {
                        id: d.id,
                        name: data.name,
                        price: data.price,
                        category: data.category,
                        isActive: data.isActive,
                        isAvailable: data.isAvailable,
                        sortOrder: data.sortOrder ?? 0,
                        parcelCharge: data.parcelCharge,
                        tags: data.tags || [],
                        updatedAt: data.updatedAt,
                    };
                });
                setItems(fetched);
                setLoading(false);
            },
            () => setLoading(false),
        );
        return () => unsub();
    }, []);

    // All items (active + inactive) grouped by category
    const grouped = useMemo(() => {
        return MENU_CATEGORIES.reduce((acc, cat) => {
            acc[cat.value] = items.filter((i) => i.category === cat.value);
            return acc;
        }, {} as Record<MenuCategory, MenuItem[]>);
    }, [items]);

    const hasPending = pendingEdits.size > 0;

    // ── Inline edit helpers ──────────────────────────────────────────────────

    function startEdit(item: MenuItem) {
        setEditingId(item.id);
        setEditDraft({
            name: item.name,
            price: String(item.price),
            parcelCharge: item.parcelCharge != null ? String(item.parcelCharge) : "",
        });
    }

    function commitEdit(item: MenuItem) {
        const name = editDraft.name.trim();
        const price = parseFloat(editDraft.price);
        const parcelCharge = editDraft.parcelCharge.trim() !== ""
            ? parseFloat(editDraft.parcelCharge)
            : undefined;

        if (!name) { toast({ title: "Name can't be empty", variant: "destructive" }); return; }
        if (isNaN(price) || price < 0) { toast({ title: "Enter a valid price", variant: "destructive" }); return; }

        const diff: PendingEdit = {};
        if (name !== item.name) diff.name = name;
        if (price !== item.price) diff.price = price;

        // parcelCharge: treat empty string as "remove the field" (undefined → delete)
        const currentParcel = item.parcelCharge ?? undefined;
        if (parcelCharge !== currentParcel) diff.parcelCharge = parcelCharge;

        if (Object.keys(diff).length > 0) {
            setPendingEdits((prev) => {
                const next = new Map(prev);
                const existing = next.get(item.id) ?? {};
                next.set(item.id, { ...existing, ...diff });
                return next;
            });
        }
        setEditingId(null);
    }

    function cancelEdit() {
        setEditingId(null);
    }

    function toggleActive(item: MenuItem) {
        const current = pendingEdits.get(item.id)?.isActive ?? item.isActive;
        const next = !current;

        // Warn before removing an item from the catalog — students with it in their
        // cart will get a clear error at checkout, but it's good to confirm intent.
        if (!next && !window.confirm(`Remove "${item.name}" from the menu?\n\nStudents who already have it in their cart will see an "unavailable" error at checkout. This won't affect orders already being prepared.`)) {
            return;
        }

        setPendingEdits((prev) => {
            const map = new Map(prev);
            const existing = map.get(item.id) ?? {};
            if (next === item.isActive) {
                const { isActive: _removed, ...rest } = existing as any;
                if (Object.keys(rest).length === 0) map.delete(item.id);
                else map.set(item.id, rest);
            } else {
                map.set(item.id, { ...existing, isActive: next });
            }
            return map;
        });
    }

    // ── Save & Reset ─────────────────────────────────────────────────────────

    async function saveChanges() {
        if (!hasPending) return;
        setSaving(true);
        try {
            const batch = writeBatch(db);
            pendingEdits.forEach((edits, itemId) => {
                const ref = doc(db, "menu_items", itemId);
                const update: Record<string, any> = { updatedAt: serverTimestamp() };
                if (edits.name !== undefined) update.name = edits.name;
                if (edits.price !== undefined) update.price = edits.price;
                if (edits.isActive !== undefined) update.isActive = edits.isActive;
                // parcelCharge: undefined means "clear", a number means "set"
                if ("parcelCharge" in edits) {
                    update.parcelCharge = edits.parcelCharge ?? null;
                }
                batch.update(ref, update);
            });
            await batch.commit();
            setPendingEdits(new Map());
            toast({ title: "Saved!", description: `${pendingEdits.size} item${pendingEdits.size > 1 ? "s" : ""} updated.` });
        } catch {
            toast({ title: "Failed to save", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    }

    function resetChanges() {
        setPendingEdits(new Map());
        setEditingId(null);
    }

    // ── Add new item ──────────────────────────────────────────────────────────

    async function handleAddItem() {
        const name = newDraft.name.trim();
        const price = parseFloat(newDraft.price);
        const parcelCharge = newDraft.parcelCharge.trim() !== ""
            ? parseFloat(newDraft.parcelCharge)
            : undefined;

        if (!name) { toast({ title: "Enter a name", variant: "destructive" }); return; }
        if (isNaN(price) || price < 0) { toast({ title: "Enter a valid price", variant: "destructive" }); return; }

        setAdding(true);
        try {
            // sortOrder: put it at the end of its category
            const categoryItems = items.filter((i) => i.category === newDraft.category);
            const maxSort = categoryItems.reduce((m, i) => Math.max(m, i.sortOrder), 0);

            const docData: Record<string, any> = {
                name,
                price,
                category: newDraft.category,
                isActive: true,
                isAvailable: true,
                sortOrder: maxSort + 10,
                updatedAt: serverTimestamp(),
            };
            if (parcelCharge !== undefined && !isNaN(parcelCharge)) {
                docData.parcelCharge = parcelCharge;
            }

            await addDoc(collection(db, "menu_items"), docData);
            setNewDraft(BLANK_DRAFT);
            setShowAddForm(false);
            toast({ title: "Item added!", description: `"${name}" is now live in the menu.` });
        } catch {
            toast({ title: "Failed to add item", variant: "destructive" });
        } finally {
            setAdding(false);
        }
    }

    // ── Derived display values ────────────────────────────────────────────────

    function effectiveName(item: MenuItem) {
        return pendingEdits.get(item.id)?.name ?? item.name;
    }
    function effectivePrice(item: MenuItem) {
        return pendingEdits.get(item.id)?.price ?? item.price;
    }
    function effectiveParcel(item: MenuItem) {
        const edit = pendingEdits.get(item.id);
        if (edit && "parcelCharge" in edit) return edit.parcelCharge;
        return item.parcelCharge;
    }
    function effectiveActive(item: MenuItem) {
        return pendingEdits.get(item.id)?.isActive ?? item.isActive;
    }
    function isPending(itemId: string) {
        return pendingEdits.has(itemId);
    }

    // ── Render ────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
                        <div className="h-5 w-32 bg-gray-200 rounded mb-3" />
                        <div className="space-y-2">
                            <div className="h-10 bg-gray-100 rounded-xl" />
                            <div className="h-10 bg-gray-100 rounded-xl" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-4 pb-32">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs text-gray-400 mt-0.5">Add items or edit names, prices &amp; parcel charges</p>
                </div>
                <Button
                    size="sm"
                    onClick={() => { setShowAddForm((p) => !p); setNewDraft(BLANK_DRAFT); }}
                    className="rounded-xl bg-primary hover:bg-primary/90 text-white h-9 text-xs font-semibold"
                >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Item
                </Button>
            </div>

            {/* Pending changes banner */}
            {hasPending && (
                <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                    <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                    <p className="text-sm font-medium text-orange-700 flex-1">
                        {pendingEdits.size} unsaved change{pendingEdits.size > 1 ? "s" : ""} — save below to apply
                    </p>
                </div>
            )}

            {/* Add item form */}
            {showAddForm && (
                <div className="bg-white rounded-2xl border border-primary/20 shadow-sm p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                        <PackagePlus className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold text-gray-800">New Item</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                            <label className="text-xs text-gray-500 mb-1 block">Name</label>
                            <Input
                                placeholder="e.g. Masala Dosa"
                                value={newDraft.name}
                                onChange={(e) => setNewDraft((p) => ({ ...p, name: e.target.value }))}
                                className="h-9 rounded-xl text-sm"
                            />
                        </div>

                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">Price (₹)</label>
                            <Input
                                type="number"
                                placeholder="0"
                                min="0"
                                value={newDraft.price}
                                onChange={(e) => setNewDraft((p) => ({ ...p, price: e.target.value }))}
                                className="h-9 rounded-xl text-sm"
                            />
                        </div>

                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">Parcel charge (₹, optional)</label>
                            <Input
                                type="number"
                                placeholder="0"
                                min="0"
                                value={newDraft.parcelCharge}
                                onChange={(e) => setNewDraft((p) => ({ ...p, parcelCharge: e.target.value }))}
                                className="h-9 rounded-xl text-sm"
                            />
                        </div>

                        <div className="col-span-2">
                            <label className="text-xs text-gray-500 mb-1 block">Category</label>
                            <select
                                value={newDraft.category}
                                onChange={(e) => setNewDraft((p) => ({ ...p, category: e.target.value as MenuCategory }))}
                                className="w-full h-9 rounded-xl border border-gray-200 bg-white text-sm px-3 focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                                {MENU_CATEGORIES.map((cat) => (
                                    <option key={cat.value} value={cat.value}>
                                        {CATEGORY_EMOJI[cat.value]} {cat.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                        <Button
                            size="sm"
                            onClick={handleAddItem}
                            disabled={adding}
                            className="flex-1 rounded-xl bg-primary hover:bg-primary/90 text-white h-9 text-sm font-semibold"
                        >
                            {adding ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
                            {adding ? "Adding..." : "Add to Menu"}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowAddForm(false)}
                            className="rounded-xl border-gray-200 h-9 text-sm"
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            {/* Category sections */}
            {MENU_CATEGORIES.map((cat) => {
                const sectionItems = grouped[cat.value] ?? [];
                if (sectionItems.length === 0) return null;
                const isExpanded = expandedSections.has(cat.value);
                const activeCount = sectionItems.filter((i) => effectiveActive(i)).length;
                const pendingCount = sectionItems.filter((i) => isPending(i.id)).length;

                return (
                    <div key={cat.value} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        {/* Section header */}
                        <button
                            onClick={() =>
                                setExpandedSections((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(cat.value)) next.delete(cat.value);
                                    else next.add(cat.value);
                                    return next;
                                })
                            }
                            className={cn(
                                "w-full px-4 py-3.5 flex items-center gap-3 text-left",
                                isExpanded && "border-b border-gray-100",
                            )}
                        >
                            <span className="text-xl leading-none select-none">{CATEGORY_EMOJI[cat.value]}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm text-gray-800">{cat.label}</span>
                                    <span className="text-xs text-gray-400">{activeCount}/{sectionItems.length} active</span>
                                    {pendingCount > 0 && (
                                        <Badge className="h-4 text-[10px] bg-orange-100 text-orange-700 border-0 px-1.5 py-0">
                                            {pendingCount} pending
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <span className="text-gray-400 shrink-0">
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </span>
                        </button>

                        {/* Items */}
                        {isExpanded && (
                            <ul className="divide-y divide-gray-50">
                                {sectionItems.map((item) =>
                                    editingId === item.id ? (
                                        <InlineEditRow
                                            key={item.id}
                                            draft={editDraft}
                                            onChange={setEditDraft}
                                            onCommit={() => commitEdit(item)}
                                            onCancel={cancelEdit}
                                        />
                                    ) : (
                                        <CatalogItemRow
                                            key={item.id}
                                            item={item}
                                            name={effectiveName(item)}
                                            price={effectivePrice(item)}
                                            parcelCharge={effectiveParcel(item)}
                                            isActive={effectiveActive(item)}
                                            pending={isPending(item.id)}
                                            onEdit={() => startEdit(item)}
                                            onToggleActive={() => toggleActive(item)}
                                        />
                                    )
                                )}
                            </ul>
                        )}
                    </div>
                );
            })}

            {/* Floating save/reset bar */}
            <div className={cn(
                "fixed bottom-0 left-0 right-0 z-50 transition-all duration-300",
                hasPending ? "translate-y-0" : "translate-y-full",
            )}>
                <div className="bg-white border-t border-gray-200 shadow-2xl shadow-black/10">
                    <div className="max-w-3xl mx-auto px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                        <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 leading-tight">
                                    {pendingEdits.size} change{pendingEdits.size > 1 ? "s" : ""} pending
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">Tap Confirm to update the live menu</p>
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
                                className="shrink-0 rounded-xl h-10 text-sm font-semibold bg-primary hover:bg-primary/90 text-white shadow-sm shadow-orange-200"
                            >
                                {saving ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <Save className="h-4 w-4 mr-2" />
                                )}
                                {saving ? "Saving..." : `Confirm ${pendingEdits.size} Change${pendingEdits.size > 1 ? "s" : ""}`}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CatalogItemRow({
    item,
    name,
    price,
    parcelCharge,
    isActive,
    pending,
    onEdit,
    onToggleActive,
}: {
    item: MenuItem;
    name: string;
    price: number;
    parcelCharge: number | undefined;
    isActive: boolean;
    pending: boolean;
    onEdit: () => void;
    onToggleActive: () => void;
}) {
    return (
        <li className={cn(
            "flex items-center gap-3 px-4 py-3 transition-colors",
            !isActive && "bg-gray-50/60 opacity-60",
            pending && "bg-orange-50/40",
        )}>
            <span className={cn(
                "h-2 w-2 rounded-full shrink-0 mt-0.5",
                isActive ? "bg-green-400" : "bg-gray-300",
            )} />

            <div className="flex-1 min-w-0">
                <span className={cn(
                    "text-sm font-medium leading-tight block truncate",
                    !isActive && "line-through text-gray-400",
                )}>
                    {name}
                </span>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-500">₹{price}</span>
                    {parcelCharge != null && parcelCharge > 0 && (
                        <span className="text-[11px] text-gray-400">+₹{parcelCharge} parcel</span>
                    )}
                    {pending && (
                        <span className="text-[11px] text-orange-500 font-medium">• unsaved</span>
                    )}
                </div>
            </div>

            <button
                onClick={onEdit}
                title="Edit"
                className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-primary hover:bg-orange-50 transition-colors shrink-0"
            >
                <Pencil className="h-3.5 w-3.5" />
            </button>

            <Switch
                checked={isActive}
                onCheckedChange={onToggleActive}
                className="data-[state=checked]:bg-primary shrink-0"
                aria-label={`${isActive ? "Deactivate" : "Activate"} ${item.name}`}
            />
        </li>
    );
}

function InlineEditRow({
    draft,
    onChange,
    onCommit,
    onCancel,
}: {
    draft: { name: string; price: string; parcelCharge: string };
    onChange: (d: { name: string; price: string; parcelCharge: string }) => void;
    onCommit: () => void;
    onCancel: () => void;
}) {
    return (
        <li className="px-4 py-3 bg-orange-50/30 space-y-2">
            <div className="flex gap-2">
                <Input
                    autoFocus
                    placeholder="Item name"
                    value={draft.name}
                    onChange={(e) => onChange({ ...draft, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") onCancel(); }}
                    className="h-8 rounded-lg text-sm flex-1"
                />
            </div>
            <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                    <Input
                        type="number"
                        placeholder="Price"
                        min="0"
                        value={draft.price}
                        onChange={(e) => onChange({ ...draft, price: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") onCancel(); }}
                        className="h-8 rounded-lg text-sm pl-5"
                    />
                </div>
                <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 whitespace-nowrap">+₹</span>
                    <Input
                        type="number"
                        placeholder="Parcel (opt)"
                        min="0"
                        value={draft.parcelCharge}
                        onChange={(e) => onChange({ ...draft, parcelCharge: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") onCancel(); }}
                        className="h-8 rounded-lg text-sm pl-6"
                    />
                </div>
                <button
                    onClick={onCommit}
                    className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary text-white shrink-0"
                    title="Save"
                >
                    <Check className="h-3.5 w-3.5" />
                </button>
                <button
                    onClick={onCancel}
                    className="h-8 w-8 rounded-lg flex items-center justify-center border border-gray-200 text-gray-500 shrink-0"
                    title="Cancel"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
        </li>
    );
}
