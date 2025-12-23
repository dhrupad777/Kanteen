"use client";

import { useMenu } from "@/hooks/use-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UtensilsCrossed, Info, ChefHat } from "lucide-react";

export function MenuDisplay() {
    const { menu, loading } = useMenu();

    if (loading) return null;
    if (!menu) return null;

    const preparedItems = Object.values(menu.prepared || {}).filter(item => item && item.trim().length > 0);

    // If everything is empty and no note, hide
    if (preparedItems.length === 0 && !menu.note) return null;

    return (
        <Card className="border-primary/20 bg-background shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/30">
                <div className="flex items-center gap-2">
                    <UtensilsCrossed className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg font-headline">Prepared Today</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
                {preparedItems.length > 0 ? (
                    <ul className="space-y-2">
                        {preparedItems.map((item, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm font-medium text-foreground/90">
                                <ChefHat className="h-4 w-4 text-orange-500 opacity-70" />
                                {item}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground italic">Menu not yet updated.</p>
                )}

                {menu.note && (
                    <div className="rounded-lg bg-orange-50 dark:bg-orange-900/20 p-3 text-sm border border-orange-100 dark:border-orange-800/50">
                        <div className="font-semibold text-orange-700 dark:text-orange-400 mb-1 flex items-center gap-1">
                            <Info className="h-3.5 w-3.5" />
                            Additional Note
                        </div>
                        <div className="text-foreground/80 pl-4.5">{menu.note}</div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
