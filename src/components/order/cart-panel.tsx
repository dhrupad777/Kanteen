"use client";

import { useCart } from "@/contexts/cart-provider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShoppingCart, Trash2, Plus, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CartPanelProps {
    onCheckout?: () => void;
    className?: string;
}

export function CartPanel({ onCheckout, className }: CartPanelProps) {
    const { items, totalItems, totalPrice, increment, decrement, removeItem, clearCart } = useCart();

    if (items.length === 0) {
        return (
            <div className={cn(
                "bg-white rounded-3xl p-8 text-center border border-gray-100",
                className
            )}>
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                    <ShoppingCart className="h-7 w-7 text-gray-400" />
                </div>
                <p className="text-gray-500 font-medium">Your cart is empty</p>
                <p className="text-gray-400 text-sm mt-1">Add items from the menu</p>
            </div>
        );
    }

    return (
        <div className={cn(
            "bg-white rounded-3xl border border-gray-100 overflow-hidden flex flex-col",
            className
        )}>
            {/* Header */}
            <div className="p-5 border-b border-gray-100">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">Your Order</h3>
                        <p className="text-sm text-gray-500">{totalItems} item{totalItems > 1 ? "s" : ""}</p>
                    </div>
                    <button
                        className="text-red-500 hover:text-red-600 text-sm font-medium flex items-center gap-1 hover:bg-red-50 px-3 py-1.5 rounded-full transition-colors"
                        onClick={clearCart}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear
                    </button>
                </div>
            </div>

            {/* Items */}
            <ScrollArea className="flex-1 max-h-[320px]">
                <div className="p-4 space-y-3">
                    {items.map((item) => (
                        <div
                            key={item.itemId}
                            className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl"
                        >
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                                <p className="text-xs text-gray-500">₹{item.price}</p>
                            </div>

                            {/* Quantity stepper */}
                            <div className="flex items-center gap-0.5 bg-white rounded-full p-0.5 shadow-sm">
                                <button
                                    className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                                    onClick={() => decrement(item.itemId)}
                                >
                                    <Minus className="h-3 w-3 text-gray-600" />
                                </button>
                                <span className="font-semibold text-gray-900 text-sm w-5 text-center">
                                    {item.qty}
                                </span>
                                <button
                                    className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                                    onClick={() => increment(item.itemId)}
                                >
                                    <Plus className="h-3 w-3 text-gray-600" />
                                </button>
                            </div>

                            <span className="text-sm font-semibold text-gray-900 w-12 text-right">
                                ₹{item.price * item.qty}
                            </span>

                            <button
                                className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors"
                                onClick={() => removeItem(item.itemId)}
                            >
                                <X className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
                            </button>
                        </div>
                    ))}
                </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-5 border-t border-gray-100 bg-gray-50">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-gray-500">Total</span>
                    <span className="text-2xl font-semibold text-gray-900">₹{totalPrice}</span>
                </div>
                <Button
                    className={cn(
                        "w-full h-12 text-base font-semibold rounded-2xl",
                        "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md",
                        "transition-all duration-200"
                    )}
                    onClick={onCheckout}
                    disabled={items.length === 0}
                >
                    Proceed to Pay
                </Button>
            </div>
        </div>
    );
}
