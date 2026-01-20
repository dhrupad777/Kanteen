"use client";

import { useCart } from "@/contexts/cart-provider";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Minus, Trash2, ArrowLeft, ShoppingBag, Package } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function CartPage() {
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();
    const { items, isHydrated, totalItems, totalPrice, increment, decrement, removeItem, clearCart, checkout } = useCart();
    const [processing, setProcessing] = useState(false);
    const [isParcel, setIsParcel] = useState(false);

    // Calculate final price including parcel charge and platform charges
    const parcelCharge = 5;
    const platformCharges = 0; // Platform convenience charges (currently ₹0)
    const finalTotal = isParcel ? totalPrice + parcelCharge + platformCharges : totalPrice + platformCharges;

    // Show loading state while checking localStorage
    if (!isHydrated) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="h-12 w-12 bg-gray-200 rounded-full mb-4"></div>
                    <div className="h-4 w-32 bg-gray-200 rounded"></div>
                </div>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
                <div className="text-center">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <ShoppingBag className="w-10 h-10 text-gray-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Your cart is empty</h1>
                    <p className="text-gray-500 mb-6">Add some items from the menu to get started</p>
                    <Button
                        onClick={() => router.push('/order')}
                        className="bg-primary text-white rounded-full px-8 py-3"
                    >
                        Browse Menu
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-gray-100 px-4 py-4">
                <div className="flex items-center justify-between max-w-2xl mx-auto">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5" />
                        <span className="font-medium">Back</span>
                    </button>
                    <h1 className="text-xl font-bold">Your Cart</h1>
                    <button
                        onClick={clearCart}
                        className="text-red-500 hover:text-red-600 text-sm font-medium"
                    >
                        Clear All
                    </button>
                </div>
            </div>

            {/* Cart Items */}
            <div className="max-w-2xl mx-auto px-4 py-6 mb-40">
                <div className="space-y-3">
                    {items.map((item, index) => (
                        <motion.div
                            key={item.itemId}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100"
                        >
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900 break-words">{item.name}</p>
                                <p className="text-sm text-gray-500">₹{item.price} each</p>
                            </div>

                            {/* Quantity stepper */}
                            <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
                                <button
                                    className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-white transition-colors"
                                    onClick={() => decrement(item.itemId)}
                                >
                                    <Minus className="h-4 w-4 text-gray-600" />
                                </button>
                                <span className="font-semibold w-8 text-center text-sm">{item.qty}</span>
                                <button
                                    className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-white transition-colors"
                                    onClick={() => increment(item.itemId)}
                                >
                                    <Plus className="h-4 w-4 text-gray-600" />
                                </button>
                            </div>

                            <span className="font-semibold text-gray-900 w-16 text-right">
                                ₹{item.price * item.qty}
                            </span>

                            <button
                                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors"
                                onClick={() => removeItem(item.itemId)}
                            >
                                <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                            </button>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Fixed Bottom Summary */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 pb-6 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20">
                <div className="max-w-2xl mx-auto space-y-4">
                    {/* Order Summary */}
                    <div className="space-y-3">
                        {/* Items list */}
                        <div className="space-y-2 max-h-32 overflow-y-auto px-2">
                            {items.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-start text-sm">
                                    <span className="text-gray-600 flex-1 pr-2 break-words">
                                        {item.name} × {item.qty}
                                    </span>
                                    <span className="font-medium text-gray-900 whitespace-nowrap">
                                        ₹{item.price * item.qty}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Parcel Toggle */}
                        <div className="flex items-center justify-between px-2 py-3 bg-gray-50 rounded-xl border border-gray-200">
                            <div className="flex items-center gap-3">
                                <Package className="h-5 w-5 text-gray-600" />
                                <div className="flex flex-col">
                                    <span className="font-medium text-gray-900">Parcel Order</span>
                                    <span className="text-xs text-gray-500">Add packaging (+₹{parcelCharge})</span>
                                </div>
                            </div>
                            <Switch
                                checked={isParcel}
                                onCheckedChange={setIsParcel}
                            />
                        </div>

                        {/* Price breakdown */}
                        <div className="space-y-1 px-2 pt-2 border-t border-gray-200">
                            <div className="flex justify-between text-sm text-gray-600">
                                <span>Subtotal ({totalItems} items)</span>
                                <span>₹{totalPrice}</span>
                            </div>
                            {isParcel && (
                                <div className="flex justify-between text-sm text-gray-600">
                                    <span>Parcel Charges</span>
                                    <span>₹{parcelCharge}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm text-gray-600">
                                <span>Platform Convenience Charges</span>
                                <span>₹{platformCharges}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2">
                                <span className="text-base font-bold text-gray-900">Total</span>
                                <span className="text-2xl font-bold text-gray-900">₹{finalTotal}</span>
                            </div>
                        </div>
                    </div>
                    <Button
                        className="w-full h-14 text-base font-semibold rounded-2xl bg-primary hover:bg-primary/90 text-white transition-all shadow-lg shadow-orange-200"
                        disabled={items.length === 0 || processing}
                        onClick={async () => {
                            if (!user?.uid) {
                                toast({
                                    title: "Login Required",
                                    description: "Please login to complete your order.",
                                    variant: "destructive",
                                });
                                router.push('/login?redirect=/cart');
                                return;
                            }
                            setProcessing(true);
                            try {
                                const { orderId, token, otp } = await checkout(user.uid, finalTotal, isParcel, platformCharges);
                                // Store OTP in local storage for the student to see later
                                localStorage.setItem(`kanteen_otp_${orderId}`, otp);

                                toast({
                                    title: "Order Placed Successfully!",
                                    description: `Token: ${token}`,
                                    variant: "default",
                                });

                                router.push(`/order/success?token=${token}&orderId=${orderId}`);
                            } catch (error: any) {
                                console.error("Checkout failed:", error);
                                toast({
                                    title: "Checkout Failed",
                                    description: error.message || "Something went wrong. Please try again.",
                                    variant: "destructive",
                                });
                            } finally {
                                setProcessing(false);
                            }
                        }}
                    >
                        {processing ? "Processing..." : "Proceed to Pay"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
