"use client";

import { motion } from "framer-motion";
import { useMenu } from "@/hooks/use-menu";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem } from "@/lib/motion-utils";

export function MenuDisplay() {
    const { menu, loading } = useMenu();
    if (loading || !menu) return null;

    const visible = menu.visibility || { breakfast: true, main: true, snacks: true, special: true, note: true };

    // Data Extraction
    const breakfast = (menu.breakfast || []).filter(s => s?.trim().length > 0);
    const mainItems = [
        menu.main?.sabji || menu.prepared?.sabji,
        menu.main?.dal || menu.prepared?.dal,
        menu.main?.bread || menu.prepared?.bread,
        menu.main?.rice || menu.prepared?.rice,
    ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0);

    const snacks = (Array.isArray(menu.snacks) ? menu.snacks : []).filter(s => s?.trim().length > 0);
    const special = (Array.isArray(menu.special) ? menu.special : []).filter(s => s?.trim().length > 0);
    const note = (menu.note ?? "").trim();

    // Visibility Flags
    const showBreakfast = visible.breakfast && breakfast.length > 0;
    const showMain = visible.main && mainItems.length > 0;
    const showSnacks = visible.snacks && snacks.length > 0;
    const showSpecial = visible.special && special.length > 0;
    const showNote = visible.note && note.length > 0;

    if (!showBreakfast && !showMain && !showSnacks && !showSpecial && !showNote) return null;


    // Helper for rendering the items container with staggered text animations
    const GroupItems = ({ items, useFlex = false, textClassName, gridCols = 2 }: { items: string[], useFlex?: boolean, textClassName?: string, gridCols?: number }) => {
        const baseTextClass = cn("font-bold tracking-tight uppercase text-black dark:text-white leading-tight", textClassName || "text-[12px]");

        if (useFlex) {
            return (
                <motion.div
                    className="flex flex-row items-center justify-between w-full overflow-hidden gap-1.5"
                    variants={staggerContainer}
                    initial="hidden"
                    animate="show"
                >
                    {items.map((item, i) => (
                        <motion.span
                            key={i}
                            variants={staggerItem}
                            className={cn(baseTextClass, "whitespace-nowrap overflow-hidden text-ellipsis flex-shrink")}
                        >
                            {item}
                        </motion.span>
                    ))}
                </motion.div>
            );
        }

        // Default Grid Behavior (dynamic columns)
        return (
            <motion.div
                className={cn("grid gap-x-2 gap-y-1",
                    gridCols === 4 ? "grid-cols-4" : "grid-cols-2"
                )}
                variants={staggerContainer}
                initial="hidden"
                animate="show"
            >
                {items.map((item, i) => (
                    <motion.span
                        key={i}
                        variants={staggerItem}
                        className={cn(baseTextClass, "truncate")}
                    >
                        {item}
                    </motion.span>
                ))}
            </motion.div>
        );
    };

    // Compact Group Tile with hover animation
    const CategoryGroup = ({ items, className, title, useFlex = false, textClassName, gridCols = 2 }: { items: string[], className?: string, title?: string, useFlex?: boolean, textClassName?: string, gridCols?: number }) => (
        <motion.div
            variants={staggerItem}
            whileHover={{ scale: 1.01, transition: { duration: 0.2 } }}
            className={cn("bg-white dark:bg-black border border-orange-100 dark:border-orange-900/30 rounded-xl p-3 shadow-sm h-full transition-shadow hover:shadow-md", className)}
        >
            {title && <div className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-2 opacity-80">{title}</div>}
            <GroupItems items={items} useFlex={useFlex} textClassName={textClassName} gridCols={gridCols} />
        </motion.div>
    );

    return (
        <motion.div
            className="w-full max-w-lg mx-auto p-0"
            style={{ fontFamily: "'Product Sans', 'Inter', sans-serif" }}
            variants={staggerContainer}
            initial="hidden"
            animate="show"
        >
            <motion.div className="flex flex-col gap-2">

                {showMain && (
                    <CategoryGroup
                        items={mainItems}
                        title="Main Course"
                        className="w-full border-orange-200 dark:border-orange-800"
                        useFlex={true}
                        textClassName="text-[12px]"
                    />
                )}

                {(showBreakfast || showSnacks) && (
                    <motion.div
                        variants={staggerItem}
                        className={cn("grid gap-2", (showBreakfast && showSnacks) ? "grid-cols-2" : "grid-cols-1")}
                    >
                        {showBreakfast && (
                            <CategoryGroup
                                items={breakfast}
                                title="Breakfast"
                                gridCols={(!showSnacks) ? 4 : 2}
                                textClassName="text-[10px] sm:text-[11px]"
                            />
                        )}
                        {showSnacks && (
                            <CategoryGroup
                                items={snacks}
                                title="Snacks"
                                gridCols={(!showBreakfast) ? 4 : 2}
                                textClassName="text-[10px] sm:text-[11px]"
                            />
                        )}
                    </motion.div>
                )}

                {/* SPECIAL GROUP - Compact Height */}
                {showSpecial && (
                    <CategoryGroup
                        items={special}
                        title="Special"
                        className="w-full border-orange-200 dark:border-orange-800"
                        useFlex={true}
                        textClassName="text-[12px]"
                    />
                )}

                {/* NOTE with entrance animation */}
                {showNote && (
                    <motion.div
                        variants={staggerItem}
                        className="mt-1 px-3 py-2 text-center bg-amber-100/50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 rounded-lg"
                    >
                        <span className="text-sm font-black text-amber-900 dark:text-amber-100 uppercase tracking-tight">
                            Note: {note}
                        </span>
                    </motion.div>
                )}
            </motion.div>
        </motion.div>
    );
}
