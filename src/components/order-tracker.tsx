"use client";

import { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order } from "@/types";
import { Loader2, Receipt, TrendingUp } from "lucide-react";
import { OrderRow } from "@/components/order-row";

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

            {orders.map((order) => (
                <OrderRow key={order.id} order={order} />
            ))}
        </div>
    );
}
