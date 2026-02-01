"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Order } from "@/types";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Key, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface OrderSummaryDialogProps {
    order: Order;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

export function OrderSummaryDialog({ order, isOpen, onOpenChange }: OrderSummaryDialogProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [regenerating, setRegenerating] = useState(false);
    const isOnlineOrder = order.token && order.token >= 201;
    const displayId = order.token ? order.token.toString() : (order.studentId.split('-')[1] || order.id);

    // Get OTP from localStorage
    const storedOtp = typeof window !== 'undefined' ? localStorage.getItem(`kanteen_otp_${order.id}`) : null;

    const handleRegenerateOtp = async () => {
        if (!user) {
            toast({ title: "Please sign in", variant: "destructive" });
            return;
        }

        setRegenerating(true);
        try {
            const token = await user.getIdToken();
            const response = await fetch(`/api/orders/${order.id}/regenerate-otp`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to regenerate OTP');
            }

            // Store new OTP in localStorage
            localStorage.setItem(`kanteen_otp_${order.id}`, data.otp);

            toast({
                title: "OTP Regenerated",
                description: `Your new OTP is ${data.otp}. Valid for 30 minutes.`,
            });

            // Force re-render by closing and reopening
            onOpenChange(false);
            setTimeout(() => onOpenChange(true), 100);

        } catch (error: any) {
            toast({
                title: "Failed to regenerate OTP",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setRegenerating(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className={cn(
                            "text-[10px] font-black uppercase tracking-widest",
                            order.status === 'Ready' ? "border-green-200 text-green-700 bg-green-50" : "border-blue-200 text-blue-700 bg-blue-50"
                        )}>
                            {order.status}
                        </Badge>
                    </div>
                    <DialogTitle className="text-2xl font-black font-headline flex items-center gap-2">
                        Order Token {displayId}
                    </DialogTitle>
                    <DialogDescription className="font-medium">
                        Order placed on {order.createdAt.toLocaleDateString()} at {order.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-4">
                    <div className="space-y-3">
                        <h4 className="text-sm font-black uppercase tracking-wider text-muted-foreground">Order Items</h4>
                        <div className="space-y-2">
                            {order.items.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-sm">{item.name}</span>
                                        <span className="text-xs text-muted-foreground">Quantity: {item.quantity}</span>
                                    </div>
                                    <span className="font-mono font-bold text-sm">₹{item.price * item.quantity}</span>
                                </div>
                            ))}
                        </div>
                        {order.isParcel && (
                            <div className="flex justify-between items-center bg-amber-50 p-2 rounded-lg border border-amber-200">
                                <span className="text-sm font-medium text-amber-900">Parcel Charges</span>
                                <span className="font-mono font-bold text-sm text-amber-900">₹5</span>
                            </div>
                        )}
                        {order.platformCharges !== undefined && (
                            <div className="flex justify-between items-center bg-blue-50 p-2 rounded-lg border border-blue-200">
                                <span className="text-sm font-medium text-blue-900">Platform Convenience Charges</span>
                                <span className="font-mono font-bold text-sm text-blue-900">₹{order.platformCharges}</span>
                            </div>
                        )}
                    </div>

                    <Separator />

                    <div className="flex justify-between items-center px-2">
                        <span className="text-lg font-black uppercase tracking-tight">Total Payment</span>
                        <span className="text-2xl font-mono font-black text-primary">₹{order.totalPrice}</span>
                    </div>

                    {/* OTP Section for Online Orders */}
                    {isOnlineOrder && ['Preparing', 'Ready'].includes(order.status) && (
                        <div className={cn(
                            "p-4 rounded-xl border-2 text-center space-y-3",
                            order.status === 'Ready' ? "bg-green-50 border-green-200" : "bg-blue-50 border-blue-200"
                        )}>
                            <div className="flex items-center justify-center gap-2">
                                <Key className={cn("w-4 h-4", order.status === 'Ready' ? "text-green-700" : "text-blue-700")} />
                                <span className={cn(
                                    "text-xs font-black uppercase tracking-widest",
                                    order.status === 'Ready' ? "text-green-700" : "text-blue-700"
                                )}>
                                    Pickup OTP
                                </span>
                            </div>
                            {storedOtp ? (
                                <p className={cn(
                                    "text-4xl font-mono font-black tracking-[0.15em]",
                                    order.status === 'Ready' ? "text-green-800" : "text-blue-800"
                                )}>
                                    {storedOtp}
                                </p>
                            ) : (
                                <p className="text-sm text-muted-foreground italic">
                                    OTP not found. Tap regenerate below.
                                </p>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleRegenerateOtp}
                                disabled={regenerating}
                                className={cn(
                                    "text-xs",
                                    order.status === 'Ready'
                                        ? "border-green-300 text-green-700 hover:bg-green-100"
                                        : "border-blue-300 text-blue-700 hover:bg-blue-100"
                                )}
                            >
                                {regenerating ? (
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                ) : (
                                    <RefreshCw className="w-3 h-3 mr-1" />
                                )}
                                {storedOtp ? "Regenerate OTP" : "Get New OTP"}
                            </Button>
                            <p className="text-[10px] text-muted-foreground">
                                Show this OTP to staff when collecting your order
                            </p>
                        </div>
                    )}

                    {/* Status Message */}
                    <div className={cn(
                        "p-4 rounded-xl border-2 text-center space-y-2",
                        order.status === 'Ready'
                            ? (isOnlineOrder ? "bg-green-50 border-green-200" : "bg-blue-50 border-blue-200")
                            : "bg-gray-50 border-gray-100"
                    )}>
                        {order.status === 'Ready' ? (
                            isOnlineOrder ? (
                                <>
                                    <p className="text-sm font-black text-green-800 uppercase tracking-wide">Ready for Pickup!</p>
                                    <p className="text-xs text-green-700 font-medium leading-relaxed">Show your Token {displayId} and OTP above to collect your meal.</p>
                                </>
                            ) : (
                                <>
                                    <p className="text-sm font-black text-blue-800 uppercase tracking-wide">Coupon Ready!</p>
                                    <p className="text-xs text-blue-700 font-medium leading-relaxed">Present your physical coupon or show this token {displayId} at the counter to collect your meal.</p>
                                </>
                            )
                        ) : (
                            <p className="text-xs text-muted-foreground font-medium italic">Your order is currently being prepared by the kitchen crew.</p>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
