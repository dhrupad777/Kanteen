"use client";

import { MenuItem, MenuCategory } from "@/types/menu-item";
import { MenuItemCard } from "./menu-item-card";
import { Dialog, DialogContent, DialogTrigger, DialogClose, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, LucideIcon, X, Package, Clock } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useIstMinute } from "@/hooks/use-ist-minute";
import { availabilityLabel, isCategoryAvailableAt, waitProgress } from "@/lib/menu-availability";
import Image from "next/image";
import { CartBottomBar } from "./cart-bottom-bar";

interface CategoryDialogProps {
    category: MenuCategory;
    label: string;
    items: MenuItem[];
    icon: LucideIcon;
    image?: string;
    /** 24/7 override is on, so category time windows do not apply. Forwarded to every
     *  card so the whole page agrees with what create-order will accept. */
    ignoreTimeWindows?: boolean;
}

export function CategoryDialog({ category, label, items, icon: Icon, image, ignoreTimeWindows = false }: CategoryDialogProps) {
    const availableCount = items.filter(i => i.isAvailable).length;

    // The tile still opens while locked — students should be able to read tomorrow's
    // lunch menu at 9am. Only adding is blocked, by the cards themselves.
    const nowMin = useIstMinute();
    const isTimeLocked = !ignoreTimeWindows && !isCategoryAvailableAt(category, nowMin);
    const opensAtLabel = isTimeLocked ? availabilityLabel(category, nowMin) : null;
    const progress = isTimeLocked ? waitProgress(category, nowMin) : null;
    const reduceMotion = useReducedMotion();

    return (
        <Dialog>
            <DialogTrigger asChild>
                <div className="group relative w-full cursor-pointer">
                    <div
                        className={cn(
                            "flex items-center justify-between p-3 sm:p-5 rounded-[20px] sm:rounded-[24px]",
                            "bg-white border border-gray-100 shadow-sm",
                            "transition-all duration-300 ease-out",
                            // Locked tiles keep the press feedback (it still opens) but lose
                            // the lift and glow, so "come back later" does not look like
                            // "tap me now".
                            !isTimeLocked && "hover:scale-[1.02] hover:shadow-xl hover:shadow-orange-100/50 hover:border-orange-100",
                            "active:scale-95",
                            "h-20 sm:h-24",
                            isTimeLocked && "overflow-hidden"
                        )}
                    >
                        {/* Left Side: Big Label */}
                        <div className="flex-1 pr-2 sm:pr-4 z-10 min-w-0">
                            <h3 className={cn(
                                "text-base sm:text-xl md:text-2xl font-bold leading-tight transition-colors line-clamp-2",
                                isTimeLocked
                                    ? "text-gray-400"
                                    : "text-gray-900 group-hover:text-primary"
                            )}>
                                {label}
                            </h3>
                            {category === 'daily_menu' && (
                                <span className="inline-flex items-center gap-1 mt-1 text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
                                    <Package className="w-3 h-3" /> Parcel only
                                </span>
                            )}
                        </div>

                        {/* Right Side: Icon or Image */}
                        <div className={cn(
                            "h-12 w-12 sm:h-16 sm:w-16 md:h-20 md:w-20 flex items-center justify-center shrink-0",
                            "text-primary/80 group-hover:text-primary transition-colors"
                        )}>
                            {image ? (
                                <Image
                                    src={image}
                                    alt={label}
                                    width={64}
                                    height={64}
                                    className="h-10 w-10 sm:h-14 sm:w-14 md:h-16 md:w-16 object-contain drop-shadow-sm"
                                    priority
                                />
                            ) : (
                                <Icon className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12" />
                            )}
                        </div>

                        {/* Wait indicator. The bar is the one genuinely moving thing here:
                            it reports how much of the wait is behind us, measured from this
                            category's own previous window rather than from the start of the
                            day, so paratha's afternoon gap fills 15:00 -> 19:00.

                            scaleX, not width: width would relayout the tile every tick.
                            Linear, because it represents constant progress through time,
                            and 600ms so the once-a-minute step reads as a creep rather than
                            a jump. Reduced motion drops the tween and just repositions. */}
                        {isTimeLocked && (
                            <div className="absolute inset-x-0 bottom-0 z-10 px-3 pb-2 sm:px-5 sm:pb-3 pointer-events-none">
                                <div className="flex items-center gap-1.5">
                                    <Clock className="h-3 w-3 shrink-0 text-primary/70" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                        {opensAtLabel}
                                    </span>
                                </div>
                                {progress !== null && (
                                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                                        <div
                                            className="h-full origin-left rounded-full bg-primary/50"
                                            style={{
                                                transform: `scaleX(${progress})`,
                                                transition: reduceMotion ? 'none' : 'transform 600ms linear',
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Decorative gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-orange-50/0 to-orange-50/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[24px] pointer-events-none" />
                    </div>
                </div>
            </DialogTrigger>

            <DialogContent className="max-w-3xl h-[90vh] sm:h-[85vh] md:h-[90vh] p-0 flex flex-col overflow-hidden bg-white border-none shadow-2xl rounded-t-[24px] sm:rounded-t-[32px] sm:rounded-[32px]">
                {/* Header */}
                <div className="p-6 pb-4 bg-white/80 backdrop-blur-xl z-10 border-b border-gray-50 shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-12 w-12 flex items-center justify-center text-primary shrink-0">
                            {image ? (
                                <Image
                                    src={image}
                                    alt={label}
                                    width={40}
                                    height={40}
                                    className="h-10 w-10 object-contain drop-shadow-sm"
                                />
                            ) : (
                                <Icon className="h-8 w-8" />
                            )}
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-bold tracking-tight">{label}</DialogTitle>
                            <p className="text-sm text-gray-500">{items.length} items</p>
                        </div>
                    </div>

                    {/* Header Close Button */}
                    <DialogClose asChild>
                        <button className="h-10 w-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                            <X className="h-6 w-6" />
                        </button>
                    </DialogClose>
                </div>

                {/* Scrollable Content */}
                <ScrollArea className="flex-1 w-full">
                    <div className="p-4 sm:p-6 pb-32">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {items.map((item) => (
                                <MenuItemCard key={item.id} item={item} ignoreTimeWindows={ignoreTimeWindows} />
                            ))}
                        </div>
                    </div>
                </ScrollArea>

                {/* Bottom Gradient Fade */}
                <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none" />

                {/* Embedded Cart Capsule (Clickable inside Dialog) */}
                <CartBottomBar className="block md:hidden z-[200]" />
            </DialogContent>
        </Dialog>
    );
}
