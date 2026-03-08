"use client";

import { forwardRef, useState, useCallback } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { Button, type ButtonProps } from "@/components/ui/button";
import { springs } from "@/lib/motion-utils";
import { ParticleBurst } from "./celebration";
import { cn } from "@/lib/utils";

type AnimatedButtonProps = ButtonProps & {
    /** Enable particle explosion on click */
    particles?: boolean;
    /** Success state - triggers pulse animation */
    success?: boolean;
    /** Children */
    children: React.ReactNode;
};

/**
 * Animated Button with Duolingo-style micro-interactions
 * 
 * Features:
 * - Tap/press shrink effect with spring physics
 * - Hover scale effect
 * - Optional particle explosion on click
 * - Success state with pulse animation
 * 
 * @example
 * ```tsx
 * <AnimatedButton particles onClick={handleAddToCart}>
 *   Add to Cart
 * </AnimatedButton>
 * 
 * <AnimatedButton success={orderPlaced}>
 *   {orderPlaced ? "Order Placed!" : "Place Order"}
 * </AnimatedButton>
 * ```
 */
export const AnimatedButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(
    ({ particles = false, success = false, children, className, onClick, ...props }, ref) => {
        const [showParticles, setShowParticles] = useState(false);

        const handleClick = useCallback(
            (e: React.MouseEvent<HTMLButtonElement>) => {
                if (particles) {
                    setShowParticles(true);
                }
                onClick?.(e);
            },
            [particles, onClick]
        );

        return (
            <div className="relative inline-block">
                <motion.div
                    whileTap={{ scale: 0.95 }}
                    whileHover={{ scale: 1.02 }}
                    transition={springs.snappy}
                    className={cn(
                        success && "animate-scale-pulse",
                    )}
                >
                    <Button
                        ref={ref}
                        className={cn(
                            "transition-shadow",
                            success && "bg-green-500 hover:bg-green-600",
                            className
                        )}
                        onClick={handleClick}
                        {...props}
                    >
                        {children}
                    </Button>
                </motion.div>

                {particles && (
                    <ParticleBurst
                        show={showParticles}
                        position={{ x: 50, y: 50 }}
                        onComplete={() => setShowParticles(false)}
                    />
                )}
            </div>
        );
    }
);

AnimatedButton.displayName = "AnimatedButton";

/**
 * Motion button that can receive all Framer Motion props
 * For advanced animation control
 */
export const MotionButton = motion.create(Button);

/**
 * Bouncy Card wrapper for clickable cards
 */
interface AnimatedCardProps extends HTMLMotionProps<"div"> {
    children: React.ReactNode;
    className?: string;
}

export const AnimatedCard = forwardRef<HTMLDivElement, AnimatedCardProps>(
    ({ children, className, ...props }, ref) => {
        return (
            <motion.div
                ref={ref}
                whileHover={{ y: -4, transition: springs.soft }}
                whileTap={{ scale: 0.98 }}
                className={cn("cursor-pointer", className)}
                {...props}
            >
                {children}
            </motion.div>
        );
    }
);

AnimatedCard.displayName = "AnimatedCard";
