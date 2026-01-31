"use client";

import { useState, useMemo } from "react";
import { MenuItem, MenuCategory, MENU_CATEGORIES } from "@/types/menu-item";
import { MenuItemCard, MenuItemCardSkeleton } from "./menu-item-card";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface MenuSectionProps {
    category: MenuCategory;
    label: string;
    items: MenuItem[];
    defaultExpanded?: boolean;
}

function MenuSection({ category, label, items, defaultExpanded = false }: MenuSectionProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    const itemCount = items.length;
    const availableCount = items.filter(i => i.isAvailable).length;

    return (
        <div className="overflow-hidden">
            {/* Section Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={cn(
                    "w-full flex items-center justify-between p-4",
                    "bg-gray-50 hover:bg-gray-100 rounded-2xl",
                    "transition-all duration-300 ease-out",
                    "group"
                )}
            >
                <div className="flex flex-col items-start">
                    <h3 className="text-lg font-semibold text-gray-900 tracking-tight">
                        {label}
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {availableCount} item{availableCount !== 1 ? "s" : ""} available
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Item count badge */}
                    <span className="text-sm font-medium text-gray-400 bg-white px-3 py-1 rounded-full">
                        {itemCount}
                    </span>

                    {/* Chevron */}
                    <div className={cn(
                        "h-8 w-8 flex items-center justify-center rounded-full bg-white",
                        "transition-all duration-300",
                        "group-hover:bg-gray-200"
                    )}>
                        <ChevronDown
                            className={cn(
                                "h-5 w-5 text-gray-600 transition-transform duration-300",
                                isExpanded && "rotate-180"
                            )}
                        />
                    </div>
                </div>
            </button>

            {/* Expandable Items Grid */}
            <div
                className={cn(
                    "grid gap-3 transition-all duration-500 ease-out",
                    "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
                    isExpanded
                        ? "max-h-[2000px] opacity-100 mt-4 px-1"
                        : "max-h-0 opacity-0 overflow-hidden"
                )}
            >
                {items.map((item) => (
                    <MenuItemCard key={item.id} item={item} />
                ))}
            </div>
        </div>
    );
}

interface MenuSectionsProps {
    items: MenuItem[];
    loading?: boolean;
    searchQuery?: string;
}

export function MenuSections({ items, loading, searchQuery }: MenuSectionsProps) {
    // Filter items by search query (memoized)
    const filteredItems = useMemo(() => {
        if (!searchQuery) return items;
        const query = searchQuery.toLowerCase();
        return items.filter(item => item.name.toLowerCase().includes(query));
    }, [items, searchQuery]);

    // Group items by category (memoized)
    const groupedItems = useMemo(() => {
        return MENU_CATEGORIES.reduce((acc, cat) => {
            acc[cat.value] = filteredItems.filter(item => item.category === cat.value);
            return acc;
        }, {} as Record<MenuCategory, MenuItem[]>);
    }, [filteredItems]);

    // Filter out empty categories (memoized)
    const nonEmptyCategories = useMemo(() => {
        return MENU_CATEGORIES.filter(cat => groupedItems[cat.value].length > 0);
    }, [groupedItems]);

    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse">
                        <div className="h-20 bg-gray-100 rounded-2xl" />
                    </div>
                ))}
            </div>
        );
    }

    if (nonEmptyCategories.length === 0) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500">
                    {searchQuery
                        ? "No items found matching your search."
                        : "No items available."}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {nonEmptyCategories.map((cat, index) => (
                <MenuSection
                    key={cat.value}
                    category={cat.value}
                    label={cat.label}
                    items={groupedItems[cat.value]}
                    defaultExpanded={index === 0} // First section expanded by default
                />
            ))}
        </div>
    );
}
