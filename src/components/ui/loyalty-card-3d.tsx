"use client";

import { useRef, useState, useCallback } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

interface LoyaltyCard3DProps {
    /** User name to display */
    userName?: string;
    /** Points or rewards count */
    points?: number;
    /** Card tier (affects gradient) */
    tier?: "bronze" | "silver" | "gold" | "platinum";
    /** Additional className */
    className?: string;
}

const tierGradients = {
    bronze: "from-amber-600 via-amber-500 to-orange-600",
    silver: "from-slate-400 via-slate-300 to-slate-500",
    gold: "from-yellow-500 via-amber-400 to-yellow-600",
    platinum: "from-slate-700 via-slate-500 to-slate-800",
};

const tierShimmer = {
    bronze: "rgba(251, 191, 36, 0.3)",
    silver: "rgba(203, 213, 225, 0.4)",
    gold: "rgba(250, 204, 21, 0.4)",
    platinum: "rgba(148, 163, 184, 0.5)",
};

/**
 * Premium 3D Loyalty Card with mouse-follow tilt effect
 * 
 * Revolut-inspired card with:
 * - 3D perspective transforms based on mouse position
 * - Metallic shimmer effect
 * - Smooth spring physics
 * 
 * @example
 * ```tsx
 * <LoyaltyCard3D 
 *   userName="John Doe" 
 *   points={1250} 
 *   tier="gold" 
 * />
 * ```
 */
export function LoyaltyCard3D({
    userName = "Kanteen Member",
    points = 0,
    tier = "bronze",
    className,
}: LoyaltyCard3DProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);

    // Motion values for smooth mouse tracking
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    // Spring physics for smooth movement
    const springConfig = { stiffness: 150, damping: 15 };
    const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [10, -10]), springConfig);
    const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-10, 10]), springConfig);

    // Shimmer position follows mouse
    const shimmerX = useSpring(useTransform(mouseX, [-0.5, 0.5], [0, 100]), springConfig);
    const shimmerY = useSpring(useTransform(mouseY, [-0.5, 0.5], [0, 100]), springConfig);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!cardRef.current) return;

        const rect = cardRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;

        mouseX.set(x);
        mouseY.set(y);
    }, [mouseX, mouseY]);

    const handleMouseLeave = useCallback(() => {
        setIsHovered(false);
        mouseX.set(0);
        mouseY.set(0);
    }, [mouseX, mouseY]);

    return (
        <div
            className={cn("perspective-1000", className)}
            style={{ perspective: "1000px" }}
        >
            <motion.div
                ref={cardRef}
                onMouseMove={handleMouseMove}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={handleMouseLeave}
                style={{
                    rotateX,
                    rotateY,
                    transformStyle: "preserve-3d",
                }}
                className={cn(
                    "relative w-80 h-48 rounded-2xl cursor-pointer",
                    "bg-gradient-to-br shadow-2xl",
                    tierGradients[tier],
                    "transition-shadow duration-300",
                    isHovered && "shadow-3xl"
                )}
            >
                {/* Shimmer overlay */}
                <motion.div
                    className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none"
                    style={{
                        background: isHovered
                            ? `radial-gradient(circle at ${shimmerX.get()}% ${shimmerY.get()}%, ${tierShimmer[tier]} 0%, transparent 50%)`
                            : "transparent",
                    }}
                />

                {/* Card content */}
                <div className="relative z-10 h-full p-6 flex flex-col justify-between text-white">
                    {/* Top row */}
                    <div className="flex justify-between items-start">
                        <div>
                            <motion.h3
                                className="text-xl font-bold tracking-wide"
                                style={{ transform: "translateZ(30px)" }}
                            >
                                KANTEEN
                            </motion.h3>
                            <p className="text-xs opacity-75 uppercase tracking-widest mt-1">
                                {tier} Member
                            </p>
                        </div>
                        <motion.div
                            style={{ transform: "translateZ(20px)" }}
                            className={cn(
                                "flex items-center gap-1 px-2 py-1 rounded-full",
                                "bg-white/20 backdrop-blur-sm"
                            )}
                        >
                            <Sparkles className="h-3 w-3" />
                            <span className="text-xs font-semibold">{points} pts</span>
                        </motion.div>
                    </div>

                    {/* Bottom row */}
                    <div style={{ transform: "translateZ(25px)" }}>
                        <p className="text-lg font-semibold tracking-wide">
                            {userName}
                        </p>
                        <p className="text-xs opacity-60 mt-1">
                            Since 2024
                        </p>
                    </div>

                    {/* Decorative elements */}
                    <div
                        className="absolute top-6 right-6 w-12 h-12 rounded-full border border-white/20"
                        style={{ transform: "translateZ(15px)" }}
                    />
                    <div
                        className="absolute bottom-6 right-6 w-8 h-8 rounded-full border border-white/10"
                        style={{ transform: "translateZ(10px)" }}
                    />
                </div>

                {/* Reflection effect at bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/20 to-transparent rounded-b-2xl" />
            </motion.div>
        </div>
    );
}

/**
 * Simpler variant without 3D - just a premium styled card
 */
export function LoyaltyCardFlat({
    userName = "Kanteen Member",
    points = 0,
    tier = "bronze",
    className,
}: LoyaltyCard3DProps) {
    return (
        <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
                "relative w-80 h-48 rounded-2xl cursor-pointer",
                "bg-gradient-to-br shadow-xl",
                tierGradients[tier],
                "transition-all duration-300 hover:shadow-2xl",
                className
            )}
        >
            <div className="relative z-10 h-full p-6 flex flex-col justify-between text-white">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-xl font-bold tracking-wide">KANTEEN</h3>
                        <p className="text-xs opacity-75 uppercase tracking-widest mt-1">
                            {tier} Member
                        </p>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/20">
                        <Sparkles className="h-3 w-3" />
                        <span className="text-xs font-semibold">{points} pts</span>
                    </div>
                </div>

                <div>
                    <p className="text-lg font-semibold tracking-wide">{userName}</p>
                    <p className="text-xs opacity-60 mt-1">Since 2024</p>
                </div>
            </div>
        </motion.div>
    );
}
