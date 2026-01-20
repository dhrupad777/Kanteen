"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Order } from "@/types";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

interface OrderSummaryDialogProps {
    order: Order;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

export function OrderSummaryDialog({ order, isOpen, onOpenChange }: OrderSummaryDialogProps) {
    const isOnlineOrder = order.token && order.token >= 201;
    const displayId = order.token ? order.token.toString() : (order.studentId.split('-')[1] || order.id);

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

                    <div className={cn(
                        "mt-6 p-4 rounded-xl border-2 text-center space-y-2",
                        order.status === 'Ready'
                            ? (isOnlineOrder ? "bg-green-50 border-green-200" : "bg-blue-50 border-blue-200")
                            : "bg-gray-50 border-gray-100"
                    )}>
                        {order.status === 'Ready' ? (
                            isOnlineOrder ? (
                                <>
                                    <p className="text-sm font-black text-green-800 uppercase tracking-wide">Ready for Pickup!</p>
                                    <p className="text-xs text-green-700 font-medium leading-relaxed">Please show your Token {displayId} and verify with the OTP on your dashboard to collect your meal.</p>
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
