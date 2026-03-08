"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { springs } from "@/lib/motion-utils";
import { cn } from "@/lib/utils";
import { useCelebration } from "./celebration";
import { Flame } from "lucide-react";

interface StreakCounterProps {
    /** Current streak count */
    count: number;
    /** Label (default: "Day Streak") */
    label?: string;
    /** Whether to celebrate on increment */
    celebrate?: boolean;
    /** Size variant */
    size?: "sm" | "md" | "lg";
    /** Additional className */
    className?: string;
}

/**
 * Animated Streak Counter with slot-machine style number roll
 * 
 * Duolingo-inspired counter for loyalty/streak features
 * 
 * @example
 * ```tsx
 * <StreakCounter count={orderStreak} label="Order Streak" celebrate />
 * ```
 */
export function StreakCounter({
    count,
    label = "Day Streak",
    celebrate = true,
    size = "md",
    className,
}: StreakCounterProps) {
    const [displayCount, setDisplayCount] = useState(count);
    const [isAnimating, setIsAnimating] = useState(false);
    const { isActive, trigger, CelebrationComponent } = useCelebration();

    // Handle count changes with animation
    useEffect(() => {
        if (count !== displayCount) {
            setIsAnimating(true);
            // Small delay for exit animation
            const timer = setTimeout(() => {
                setDisplayCount(count);
                if (celebrate && count > displayCount) {
                    trigger();
                }
            }, 150);
            return () => clearTimeout(timer);
        }
    }, [count, displayCount, celebrate, trigger]);

    // Reset animation state after update
    useEffect(() => {
        if (isAnimating) {
            const timer = setTimeout(() => setIsAnimating(false), 400);
            return () => clearTimeout(timer);
        }
    }, [displayCount, isAnimating]);

    const sizeClasses = useMemo(() => ({
        sm: { container: "p-2", number: "text-2xl", label: "text-xs", icon: "h-4 w-4" },
        md: { container: "p-3", number: "text-4xl", label: "text-sm", icon: "h-5 w-5" },
        lg: { container: "p-4", number: "text-6xl", label: "text-base", icon: "h-6 w-6" },
    }), []);

    const sizes = sizeClasses[size];

    // Split number into digits for individual animation
    const digits = String(displayCount).split("");

    return (
        <div className={cn("relative inline-flex flex-col items-center", className)}>
            <CelebrationComponent />

            <motion.div
                className={cn(
                    "flex items-center gap-2 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg",
                    sizes.container,
                    isAnimating && "animate-celebrate"
                )}
                initial={false}
                animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                transition={springs.bouncy}
            >
                <Flame className={cn(sizes.icon, "text-yellow-300")} />

                <div className="flex overflow-hidden">
                    <AnimatePresence mode="popLayout">
                        {digits.map((digit, index) => (
                            <motion.span
                                key={`${displayCount}-${index}`}
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: -20, opacity: 0 }}
                                transition={{
                                    type: "spring",
                                    stiffness: 500,
                                    damping: 25,
                                    delay: index * 0.05,
                                }}
                                className={cn(
                                    "inline-block font-black tabular-nums",
                                    sizes.number
                                )}
                            >
                                {digit}
                            </motion.span>
                        ))}
                    </AnimatePresence>
                </div>
            </motion.div>

            <motion.span
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                    "mt-1 font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider",
                    sizes.label
                )}
            >
                {label}
            </motion.span>
        </div>
    );
}

/**
 * Simple animated number that rolls on change
 */
interface AnimatedNumberProps {
    value: number;
    className?: string;
    prefix?: string;
    suffix?: string;
}

export function AnimatedNumber({ value, className, prefix = "", suffix = "" }: AnimatedNumberProps) {
    return (
        <span className={cn("inline-flex items-baseline", className)}>
            {prefix}
            <AnimatePresence mode="popLayout">
                <motion.span
                    key={value}
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -10, opacity: 0 }}
                    transition={springs.snappy}
                    className="inline-block tabular-nums"
                >
                    {value}
                </motion.span>
            </AnimatePresence>
            {suffix}
        </span>
    );
}
