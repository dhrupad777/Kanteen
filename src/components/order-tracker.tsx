"use client";

import { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order } from "@/types";
import { format } from "date-fns";
import { Loader2, Receipt, Clock, CheckCircle2, ChefHat, Package, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function OrderTracker() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Query by createdAt date range — no composite index needed, works reliably on refresh
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const q = query(
            collection(db, "orders"),
            where("createdAt", ">=", Timestamp.fromDate(startOfToday)),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched: Order[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data() as Partial<Order>;
                // Only track successful orders
                if (data.status && ['PAID', 'Preparing', 'Ready', 'Completed', 'PICKED_UP'].includes(data.status)) {
                    fetched.push({
                        ...data,
                        id: doc.id,
                        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt as any)
                    } as Order);
                }
            });
            setOrders(fetched);
            setLoading(false);
        }, (error) => {
            console.error("OrderTracker snapshot error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (orders.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <Receipt className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <h3 className="text-lg font-semibold text-gray-900">No Orders Yet</h3>
                <p className="text-sm text-gray-500">Successful payments will appear here in real-time.</p>
            </div>
        );
    }

    const totalRevenue = orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
    const activeCount = orders.filter(o => !['Completed', 'PICKED_UP'].includes(o.status)).length;

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'PAID': return "bg-blue-50 text-blue-700 border-blue-200";
            case 'Preparing': return "bg-orange-50 text-orange-700 border-orange-200";
            case 'Ready': return "bg-emerald-50 text-emerald-700 border-emerald-200";
            case 'Completed':
            case 'PICKED_UP': return "bg-green-50 text-green-700 border-green-200";
            default: return "bg-gray-50 text-gray-600 border-gray-200";
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'PAID': return <Receipt className="h-3.5 w-3.5" />;
            case 'Preparing': return <ChefHat className="h-3.5 w-3.5" />;
            case 'Ready': return <CheckCircle2 className="h-3.5 w-3.5" />;
            case 'Completed':
            case 'PICKED_UP': return <CheckCircle2 className="h-3.5 w-3.5" />;
            default: return <Receipt className="h-3.5 w-3.5" />;
        }
    };

    const getStatusLabel = (status: string) => {
        if (status === 'PICKED_UP') return 'Collected';
        if (status === 'Completed') return 'Collected';
        return status;
    };

    return (
        <div className="space-y-4">
            {/* Summary bar */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-4">
                <TrendingUp className="h-4 w-4 text-primary shrink-0" />
                <div className="flex items-center gap-3 text-sm flex-wrap">
                    <span className="font-semibold text-gray-900">{orders.length} orders today</span>
                    <span className="text-gray-300">·</span>
                    <span className="font-bold text-primary">₹{totalRevenue}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-orange-600 font-medium">{activeCount} active</span>
                </div>
            </div>

            {orders.map((order) => {
                const pickedUpAt = (order as any).kitchen?.pickedUpAt;
                const pickedUpDate = pickedUpAt instanceof Timestamp
                    ? pickedUpAt.toDate()
                    : pickedUpAt ? new Date(pickedUpAt) : null;

                const isDone = order.status === 'Completed' || order.status === 'PICKED_UP';

                return (
                    <div key={order.id} className={cn(
                        "bg-white rounded-2xl p-4 border shadow-sm transition-all hover:shadow-md",
                        isDone ? "border-green-100 bg-green-50/30" : "border-gray-100"
                    )}>
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-2xl font-black text-gray-900 tracking-tight">#{order.token}</span>
                                    <Badge variant="outline" className={cn("px-2 py-0.5 whitespace-nowrap gap-1 font-semibold", getStatusStyle(order.status))}>
                                        {getStatusIcon(order.status)}
                                        {getStatusLabel(order.status)}
                                    </Badge>
                                    {order.isParcel && (
                                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 font-semibold gap-1">
                                            <Package className="h-3.5 w-3.5" />
                                            Parcel
                                        </Badge>
                                    )}
                                </div>
                                <h3 className="text-sm font-semibold text-gray-700">{order.userName || 'Guest'}</h3>
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-bold text-gray-900">₹{order.totalPrice}</p>
                                <p className="text-[11px] font-medium text-gray-500 flex items-center justify-end gap-1 mt-0.5">
                                    <Clock className="h-3 w-3" />
                                    {format(order.createdAt, "h:mm a")}
                                </p>
                                {pickedUpDate && (
                                    <p className="text-[11px] font-medium text-green-600 flex items-center justify-end gap-1 mt-0.5">
                                        <CheckCircle2 className="h-3 w-3" />
                                        Collected {format(pickedUpDate, "h:mm a")}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-3">
                            <ul className="space-y-1.5">
                                {order.items.map((item, i) => (
                                    <li key={i} className="flex justify-between text-sm">
                                        <span className="font-medium text-gray-800">
                                            {item.quantity} × {item.name}
                                        </span>
                                        <span className="text-gray-500 font-medium">₹{item.price * item.quantity}</span>
                                    </li>
                                ))}
                            </ul>
                            {order.note && (
                                <div className="mt-3 text-xs bg-amber-50 text-amber-800 p-2 rounded border border-amber-100 font-medium">
                                    <span className="font-bold mr-1">Note:</span>{order.note}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
