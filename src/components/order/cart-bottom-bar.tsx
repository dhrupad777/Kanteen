"use client";

import { useRouter } from "next/navigation";
import { useCart } from "@/contexts/cart-provider";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface CartBottomBarProps {
    className?: string;
}

export function CartBottomBar({ className }: CartBottomBarProps) {
    const router = useRouter();
    const { items, totalItems, totalPrice } = useCart();

    if (items.length === 0) {
        return null;
    }

    const handleClick = () => {
        router.push('/cart');
    };

    return (
        <div
            className={cn(
                "fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] md:hidden",
                "transition-all duration-300",
                className
            )}
        >
            <motion.button
                key={totalItems}
                initial={{ scale: 0.8, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                onClick={handleClick}
                className={cn(
                    "flex items-center gap-4 px-5 py-3",
                    "bg-primary text-primary-foreground rounded-[28px]",
                    "shadow-[0_8px_32px_rgba(249,115,22,0.4)]",
                    "backdrop-blur-xl",
                    "border border-white/20"
                )}
            >
                {/* Item count pill */}
                <div className="flex items-center justify-center bg-white/20 rounded-full h-7 w-7 text-sm font-semibold text-white">
                    {totalItems}
                </div>

                {/* Divider */}
                <div className="w-px h-5 bg-white/20" />

                {/* Price */}
                <span className="font-semibold text-base tracking-tight text-white">
                    ₹{totalPrice}
                </span>

                {/* View Order text */}
                <span className="text-white/90 text-sm font-medium">
                    View Order
                </span>
            </motion.button>
        </div>
    );
}
