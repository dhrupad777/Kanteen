"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight, Home, Loader2, Clock, ChefHat } from "lucide-react";
import { motion } from "framer-motion";

function SuccessContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [token, setToken] = useState<string | null>(null);
    const [orderSummary, setOrderSummary] = useState<{
        items: { name: string; quantity: number; price: number }[];
        total: number;
        isParcel: boolean;
    } | null>(null);

    useEffect(() => {
        const tokenVal = searchParams.get("token");
        setToken(tokenVal);

        // Try to get order summary from sessionStorage (set during checkout)
        const summaryData = sessionStorage.getItem('lastOrderSummary');
        if (summaryData) {
            try {
                setOrderSummary(JSON.parse(summaryData));
                // Clear after reading
                sessionStorage.removeItem('lastOrderSummary');
            } catch (e) {
                console.error('Failed to parse order summary');
            }
        }
    }, [searchParams]);

    if (!token) {
        return (
            <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                <p className="text-gray-500">Loading...</p>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-full max-w-md"
        >
            {/* Success Header */}
            <div className="text-center mb-6">
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                    className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
                >
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                </motion.div>
                <h1 className="text-2xl font-bold text-gray-900">Order Confirmed!</h1>
            </div>

            {/* Token Card - Main Focus */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-3xl p-6 text-white text-center mb-4 shadow-lg shadow-orange-200"
            >
                <p className="text-orange-100 text-xs font-bold uppercase tracking-widest mb-1">Your Token</p>
                <p className="text-6xl font-black tracking-tight">{token}</p>
                <p className="text-orange-100 text-sm mt-2">Show this when collecting your order</p>
            </motion.div>

            {/* Order Summary (if available) */}
            {orderSummary && orderSummary.items.length > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="bg-white rounded-2xl p-4 mb-4 border border-gray-100"
                >
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Order Summary</p>
                    <div className="space-y-2">
                        {orderSummary.items.map((item, i) => (
                            <div key={i} className="flex justify-between text-sm">
                                <span className="text-gray-700">
                                    {item.name} <span className="text-gray-400">×{item.quantity}</span>
                                </span>
                                <span className="font-semibold text-gray-900">₹{item.price * item.quantity}</span>
                            </div>
                        ))}
                        {orderSummary.isParcel && (
                            <div className="flex justify-between text-sm text-gray-500">
                                <span>Parcel Charges</span>
                                <span>₹5</span>
                            </div>
                        )}
                        <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                            <span>Total</span>
                            <span className="text-orange-600">₹{orderSummary.total}</span>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Status Info */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="bg-blue-50 rounded-2xl p-4 mb-6 flex items-center gap-3"
            >
                <div className="bg-blue-100 p-2 rounded-full">
                    <ChefHat className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                    <p className="font-bold text-blue-900 text-sm">Being Prepared</p>
                    <p className="text-blue-700 text-xs">Wait on your dashboard — your OTP appears there when it's ready for pickup</p>
                </div>
            </motion.div>

            {/* CTA Button */}
            <Button
                onClick={() => router.push("/student")}
                className="w-full h-14 rounded-2xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-base shadow-lg active:scale-[0.98] transition-all"
            >
                <Home className="mr-2 w-5 h-5" />
                Go to Dashboard
                <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
        </motion.div>
    );
}

export default function OrderSuccessPage() {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <Suspense fallback={
                <div className="flex flex-col items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                    <p className="text-gray-500">Loading...</p>
                </div>
            }>
                <SuccessContent />
            </Suspense>
        </div>
    );
}
