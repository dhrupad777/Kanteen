"use client";

import { MenuItem } from "@/types/menu-item";
import { useCart } from "@/contexts/cart-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

import { motion, AnimatePresence } from "framer-motion";

interface MenuItemCardProps {
    item: MenuItem;
}

export function MenuItemCard({ item }: MenuItemCardProps) {
    const { getItemQty, addItem, increment, decrement } = useCart();
    const qty = getItemQty(item.id);
    const isUnavailable = !item.isAvailable;
    const isMRP = item.price === null;

    const handleAdd = () => {
        if (isUnavailable || isMRP) return;
        navigator.vibrate?.([30, 10, 40]); // click-clack feel
        addItem(item);
    };

    const handleIncrement = () => {
        navigator.vibrate?.(20); // crisp tap
        increment(item.id);
    };

    const handleDecrement = () => {
        navigator.vibrate?.([15, 8, 15]); // double-tap — distinct from increment
        decrement(item.id);
    };

    return (
        <div
            className={cn(
                "relative flex flex-col p-4 rounded-2xl bg-white",
                "border border-gray-100",
                "transition-all duration-300 ease-out",
                "hover:shadow-lg hover:shadow-gray-100 hover:border-gray-200",
                "hover:-translate-y-0.5",
                isUnavailable && "opacity-50"
            )}
        >
            {/* Item info */}
            <div className="flex-1 mb-3">
                <h4 className="font-medium text-gray-900 text-sm leading-tight line-clamp-2">
                    {item.name}
                </h4>

                {item.tags && item.tags.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                        {item.tags.map((tag) => (
                            <span
                                key={tag}
                                className={cn(
                                    "text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide",
                                    tag === "veg" && "bg-green-50 text-green-600",
                                    tag === "egg" && "bg-amber-50 text-amber-600",
                                    tag !== "veg" && tag !== "egg" && "bg-gray-100 text-gray-500"
                                )}
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Price & Action Row */}
            <div className="flex items-center justify-between mt-auto">
                {/* Price */}
                <span className={cn(
                    "font-semibold text-gray-900",
                    isMRP ? "text-xs" : "text-base"
                )}>
                    {isMRP ? "MRP" : `₹${item.price}`}
                </span>

                {/* Add / Quantity controls */}
                <div className="h-8 flex items-center justify-end">
                    {isUnavailable ? (
                        <span className="text-xs text-gray-400 font-medium">
                            Unavailable
                        </span>
                    ) : isMRP ? (
                        <span className="text-xs text-gray-400 font-medium">
                            Ask at counter
                        </span>
                    ) : qty === 0 ? (
                        <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={handleAdd}
                            className={cn(
                                "h-8 px-4 rounded-full text-sm font-semibold",
                                "bg-primary text-primary-foreground shadow-sm",
                                "transition-colors hover:bg-primary/90"
                            )}
                        >
                            Add
                        </motion.button>
                    ) : (
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="flex items-center gap-1 bg-primary text-primary-foreground rounded-full p-0.5 shadow-sm"
                        >
                            <motion.button
                                whileTap={{ scale: 0.9 }}
                                className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                                onClick={handleDecrement}
                            >
                                <Minus className="h-3.5 w-3.5" />
                            </motion.button>

                            <motion.span
                                key={qty}
                                initial={{ y: -5, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                className="font-semibold text-sm w-5 text-center"
                            >
                                {qty}
                            </motion.span>

                            <motion.button
                                whileTap={{ scale: 0.9 }}
                                className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                                onClick={handleIncrement}
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </motion.button>
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Skeleton for loading state
export function MenuItemCardSkeleton() {
    return (
        <div className="p-4 rounded-2xl bg-white border border-gray-100">
            <div className="space-y-3">
                <div className="h-4 bg-gray-100 rounded-full w-3/4 animate-pulse" />
                <div className="h-3 bg-gray-100 rounded-full w-1/2 animate-pulse" />
            </div>
            <div className="flex items-center justify-between mt-4">
                <div className="h-5 bg-gray-100 rounded-full w-12 animate-pulse" />
                <div className="h-8 bg-gray-100 rounded-full w-16 animate-pulse" />
            </div>
        </div>
    );
}
