"use client";

import { MenuCategory, MENU_CATEGORIES } from "@/types/menu-item";
import { cn } from "@/lib/utils";

interface MenuCategoryTabsProps {
    activeCategory: MenuCategory | null;
    onCategoryChange: (category: MenuCategory | null) => void;
    className?: string;
}

export function MenuCategoryTabs({
    activeCategory,
    onCategoryChange,
    className,
}: MenuCategoryTabsProps) {
    return (
        <div className={cn("flex gap-2 overflow-x-auto pb-2", className)}>
            <button
                onClick={() => onCategoryChange(null)}
                className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                    activeCategory === null
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80 text-muted-foreground"
                )}
            >
                All
            </button>
            {MENU_CATEGORIES.map((cat) => (
                <button
                    key={cat.value}
                    onClick={() => onCategoryChange(cat.value)}
                    className={cn(
                        "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                        activeCategory === cat.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-muted/80 text-muted-foreground"
                    )}
                >
                    {cat.label}
                </button>
            ))}
        </div>
    );
}
