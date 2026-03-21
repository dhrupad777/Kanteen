"use client";

import { motion } from "framer-motion";
import { useMenu } from "@/hooks/use-menu";
import { cn } from "@/lib/utils";

export function MenuDisplay() {
    const { menu, loading } = useMenu();
    if (loading || !menu) return null;

    const visible = menu.visibility || { breakfast: true, note: true };

    // Data Extraction: 'breakfast' field is now used universally for the unified daily menu
    const items = (menu.breakfast || []).filter(s => s?.trim().length > 0);
    const note = (menu.note ?? "").trim();

    const showItems = visible.breakfast && items.length > 0;
    const showNote = visible.note && note.length > 0;

    if (!showItems && !showNote) return null;

    return (
        <div className="w-full max-w-lg mx-auto p-0 font-sans">
            <div className="flex flex-col gap-4">
                
                {showItems && (
                    <div className="bg-white/80 dark:bg-black/60 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-5 shadow-sm">
                        <ul className={items.length >= 4 ? "grid grid-cols-2 gap-x-4 gap-y-3" : "flex flex-col space-y-3.5"}>
                            {items.map((item, i) => (
                                <motion.li
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05, type: 'spring', stiffness: 300, damping: 24 }}
                                    className="flex items-start gap-4 group"
                                >
                                    <div className="mt-2 h-1.5 w-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)] shrink-0 transition-transform group-hover:scale-150 duration-300" />
                                    <span className="text-gray-900 dark:text-gray-100 font-semibold text-[15px] leading-snug tracking-tight">
                                        {item}
                                    </span>
                                </motion.li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* NOTE */}
                {showNote && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="px-4 py-3.5 bg-gradient-to-br from-amber-50 to-orange-50/50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200/50 dark:border-amber-800/30 rounded-2xl"
                    >
                        <div className="flex gap-2.5 items-start">
                            <span className="text-amber-500 text-lg leading-none mt-0.5">💡</span>
                            <span className="text-sm font-medium text-amber-900 dark:text-amber-100 leading-snug">
                                {note}
                            </span>
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
