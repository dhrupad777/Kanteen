"use client";

import { useMenu } from "@/hooks/use-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UtensilsCrossed, Info, ChefHat, Soup, Sparkles, Coffee } from "lucide-react";

type SlotRow = { label: string; value?: string | null };

function SlotList({ rows }: { rows: SlotRow[] }) {
    return (
        <div className="space-y-2">
            {rows.map((r, i) => {
                const v = (r.value || "").trim();
                const has = v.length > 0;

                return (
                    <div key={`${r.label}-${i}`} className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            {r.label}
                        </span>
                        <span className={has ? "text-sm font-medium text-foreground" : "text-sm text-muted-foreground italic"}>
                            {has ? v : "Not set"}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

export function MenuDisplay() {
    const { menu, loading } = useMenu();
    if (loading || !menu) return null;

    // Backward compatibility: If no visibility object, assume all true
    const visible = menu.visibility || {
        breakfast: true,
        main: true,
        snacks: true,
        special: true,
        note: true
    };

    // --- Data Extraction & Normalization ---

    // 1. Breakfast (new field, default to empty array)
    const breakfastItems = (menu.breakfast || []).filter(s => s && s.trim().length > 0);

    // 2. Main (fallback to old prepared keys if new main missing)
    const main = menu.main ?? {
        sabji: menu.prepared?.sabji ?? "",
        dal: menu.prepared?.dal ?? "",
        bread: menu.prepared?.bread ?? "",
        rice: menu.prepared?.rice ?? "",
    };
    const hasMain = Object.values(main).some(x => x && x.trim().length > 0);

    // 3. Snacks (handle old object vs new array)
    let snackItems: string[] = [];
    if (Array.isArray(menu.snacks)) {
        snackItems = menu.snacks;
    } else {
        // Fallback for old data
        snackItems = [
            menu.prepared?.snacks01,
            menu.prepared?.snacks02,
            // @ts-ignore
            menu.snacks?.snack1,
            // @ts-ignore
            menu.snacks?.snack2
        ].filter(Boolean) as string[];
    }
    snackItems = snackItems.filter(s => s && s.trim().length > 0);

    // 4. Special & Note
    const special = (menu.special ?? menu.prepared?.specials ?? "").trim();
    const note = (menu.note ?? "").trim();

    // --- Global Empty Check ---
    // If no sections are visible OR all visible sections are empty -> Hide component
    const showBreakfast = visible.breakfast && breakfastItems.length > 0;
    const showMain = visible.main && hasMain;
    const showSnacks = visible.snacks && snackItems.length > 0;
    const showSpecial = visible.special && special.length > 0;
    const showNote = visible.note && note.length > 0;

    if (!showBreakfast && !showMain && !showSnacks && !showSpecial && !showNote) return null;

    return (
        <Card className="border-primary/20 bg-background shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/30">
                <div className="flex items-center gap-2">
                    <UtensilsCrossed className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg font-headline tracking-tight">
                        Prepared Today
                    </CardTitle>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                    Today{"'"}s delicious offerings
                </p>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">

                {/* SECTION: Breakfast */}
                {showBreakfast && (
                    <div className="rounded-xl border bg-card p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <Coffee className="h-4 w-4 text-orange-600" />
                            <div className="font-semibold text-sm tracking-tight">Breakfast</div>
                        </div>
                        <div className="border-l-4 border-orange-500/40 pl-4">
                            <SlotList rows={breakfastItems.map((item, i) => ({ label: `Item ${i + 1}`, value: item }))} />
                        </div>
                    </div>
                )}

                {/* SECTION: Main */}
                {showMain && (
                    <div className="rounded-xl border bg-card p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <ChefHat className="h-4 w-4 text-emerald-600" />
                                <div className="font-semibold text-sm tracking-tight">Main Course</div>
                            </div>
                            <div className="text-xs text-muted-foreground hidden sm:block">Sabji • Dal • Bread • Rice</div>
                        </div>

                        <div className="border-l-4 border-emerald-500/40 pl-4">
                            <SlotList
                                rows={[
                                    { label: "Sabji", value: main.sabji },
                                    { label: "Dal", value: main.dal },
                                    { label: "Bread", value: main.bread },
                                    { label: "Rice", value: main.rice },
                                ]}
                            />
                        </div>
                    </div>
                )}

                {/* SECTION: Snacks */}
                {showSnacks && (
                    <div className="rounded-xl border bg-card p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <Soup className="h-4 w-4 text-sky-600" />
                            <div className="font-semibold text-sm tracking-tight">Snacks</div>
                        </div>

                        <div className="border-l-4 border-sky-500/40 pl-4">
                            <SlotList
                                rows={snackItems.map((item, i) => ({ label: `Snack ${i + 1}`, value: item }))}
                            />
                        </div>
                    </div>
                )}

                {/* SECTION: Special */}
                {showSpecial && (
                    <div className="rounded-xl border bg-card p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <Sparkles className="h-4 w-4 text-violet-600" />
                            <div className="font-semibold text-sm tracking-tight">Special</div>
                        </div>

                        <div className="border-l-4 border-violet-500/40 pl-4">
                            <div className="text-sm font-medium">
                                {special}
                            </div>
                        </div>
                    </div>
                )}

                {/* SECTION: Additional Note */}
                {showNote && (
                    <div className="rounded-xl border bg-orange-50 dark:bg-orange-900/20 p-4 shadow-sm border-orange-100 dark:border-orange-800/50">
                        <div className="font-semibold text-orange-700 dark:text-orange-400 mb-1 flex items-center gap-2">
                            <Info className="h-4 w-4" />
                            Additional Note
                        </div>
                        <div className="text-sm text-foreground/80 pl-6">
                            {note}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
