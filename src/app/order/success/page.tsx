"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Ticket, Key, ArrowRight, Home, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

function SuccessContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [token, setToken] = useState<string | null>(null);
    const [otp, setOtp] = useState<string | null>(null);

    useEffect(() => {
        const orderId = searchParams.get("orderId");
        const tokenVal = searchParams.get("token");

        setToken(tokenVal);

        if (orderId) {
            const storedOtp = localStorage.getItem(`kanteen_otp_${orderId}`);
            // Filter out invalid stored values
            if (storedOtp && storedOtp !== 'undefined' && storedOtp !== 'null') {
                setOtp(storedOtp);
            }
        }
    }, [searchParams]);

    if (!token) {
        return (
            <div className="text-center">
                <p className="text-gray-500">Redirecting...</p>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-white rounded-[32px] p-8 shadow-xl shadow-orange-100 border border-orange-50 text-center"
        >
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>

            <h1 className="text-3xl font-bold text-gray-900 mb-2">Order Confirmed!</h1>
            <p className="text-gray-500 mb-8">Your order has been placed successfully.</p>

            <div className="space-y-4 mb-8">
                {/* Token Box */}
                <div className="bg-orange-50 rounded-2xl p-8 border border-orange-100 shadow-inner">
                    <div className="flex items-center justify-center gap-2 text-orange-600 mb-2">
                        <Ticket className="w-5 h-5" />
                        <span className="text-xs font-black uppercase tracking-widest">Order Token</span>
                    </div>
                    <div className="text-6xl font-black text-orange-600 tracking-tighter">
                        {token}
                    </div>
                </div>

                {/* OTP Box - Critical for pickup verification */}
                {otp && (
                    <div className="bg-green-50 rounded-2xl p-6 border border-green-200 shadow-inner">
                        <div className="flex items-center justify-center gap-2 text-green-700 mb-2">
                            <Key className="w-5 h-5" />
                            <span className="text-xs font-black uppercase tracking-widest">Pickup OTP</span>
                        </div>
                        <div className="text-5xl font-black text-green-700 tracking-widest font-mono">
                            {otp}
                        </div>
                        <p className="text-xs text-green-600 mt-3 font-medium">
                            Show this OTP when collecting your order
                        </p>
                    </div>
                )}

                <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                    <p className="text-sm font-bold text-blue-700">
                        Your order is being prepared. You can track progress on your dashboard.
                    </p>
                </div>
            </div>

            <div className="space-y-3">
                <Button
                    onClick={() => router.push("/student")}
                    className="w-full h-16 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black text-lg shadow-xl shadow-orange-200 active:scale-95 transition-all"
                >
                    <Home className="mr-2 w-5 h-5" />
                    GO TO DASHBOARD
                    <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
            </div>
        </motion.div>
    );
}

export default function OrderSuccessPage() {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <Suspense fallback={
                <div className="flex flex-col items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                    <p className="text-gray-500">Loading order details...</p>
                </div>
            }>
                <SuccessContent />
            </Suspense>
        </div>
    );
}
