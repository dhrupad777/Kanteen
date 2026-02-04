"use client";

import { MenuItem, MenuCategory } from "@/types/menu-item";
import { MenuItemCard } from "./menu-item-card";
import { Dialog, DialogContent, DialogTrigger, DialogClose, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, LucideIcon, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { CartBottomBar } from "./cart-bottom-bar";

interface CategoryDialogProps {
    category: MenuCategory;
    label: string;
    items: MenuItem[];
    icon: LucideIcon;
    image?: string;
}

export function CategoryDialog({ category, label, items, icon: Icon, image }: CategoryDialogProps) {
    const availableCount = items.filter(i => i.isAvailable).length;

    return (
        <Dialog>
            <DialogTrigger asChild>
                <div className="group relative w-full cursor-pointer">
                    <div
                        className={cn(
                            "flex items-center justify-between p-3 sm:p-5 rounded-[20px] sm:rounded-[24px]",
                            "bg-white border border-gray-100 shadow-sm",
                            "transition-all duration-300 ease-out",
                            "hover:scale-[1.02] hover:shadow-xl hover:shadow-orange-100/50 hover:border-orange-100",
                            "active:scale-95",
                            "h-20 sm:h-24"
                        )}
                    >
                        {/* Left Side: Big Label */}
                        <div className="flex-1 pr-2 sm:pr-4 z-10 min-w-0">
                            <h3 className="text-base sm:text-xl md:text-2xl font-bold text-gray-900 leading-tight group-hover:text-primary transition-colors truncate">
                                {label}
                            </h3>
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
                                    loading="lazy"
                                />
                            ) : (
                                <Icon className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12" />
                            )}
                        </div>

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
                                <MenuItemCard key={item.id} item={item} />
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
