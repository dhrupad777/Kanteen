"use client";

import { Timestamp } from "firebase/firestore";
import { format } from "date-fns";
import { Receipt, Clock, CheckCircle2, ChefHat, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * One staff-facing order card: token, status, amount, times, items, note.
 *
 * Extracted from OrderTracker so the student directory can show the same card
 * for a student's order history. This is the compact staff variant — the larger
 * OrderStatusBadge in order-status-badge.tsx belongs to the student-facing
 * OrderCard and is deliberately a different thing.
 */

/** Structurally exactly what this card reads — so both a live Firestore `Order`
 *  (Timestamps, `kitchen.pickedUpAt`) and an API `StudentOrderSummary` (ISO
 *  strings, flat `pickedUpAt`) can be passed without a cast on either side. */
interface OrderRowData {
    token: number;
    status: string;
    totalPrice: number;
    items: { name: string; quantity: number; price: number }[];
    isParcel?: boolean;
    note?: string;
    userName?: string;
    createdAt?: unknown;
    pickedUpAt?: unknown;
    kitchen?: { pickedUpAt?: unknown };
}

interface OrderRowProps {
    order: OrderRowData;
    /** The directory already shows whose order this is, so it hides the name. */
    showName?: boolean;
}

function getStatusStyle(status: string) {
    switch (status) {
        case 'PAID': return "bg-blue-50 text-blue-700 border-blue-200";
        case 'Preparing': return "bg-orange-50 text-orange-700 border-orange-200";
        case 'Ready': return "bg-emerald-50 text-emerald-700 border-emerald-200";
        case 'Completed':
        case 'PICKED_UP': return "bg-green-50 text-green-700 border-green-200";
        default: return "bg-gray-50 text-gray-600 border-gray-200";
    }
}

function getStatusIcon(status: string) {
    switch (status) {
        case 'PAID': return <Receipt className="h-3.5 w-3.5" />;
        case 'Preparing': return <ChefHat className="h-3.5 w-3.5" />;
        case 'Ready': return <CheckCircle2 className="h-3.5 w-3.5" />;
        case 'Completed':
        case 'PICKED_UP': return <CheckCircle2 className="h-3.5 w-3.5" />;
        default: return <Receipt className="h-3.5 w-3.5" />;
    }
}

function getStatusLabel(status: string) {
    if (status === 'PICKED_UP') return 'Collected';
    if (status === 'Completed') return 'Collected';
    return status;
}

/** Firestore hands back a Timestamp over the client SDK and an ISO string over
 *  the API routes, so coerce whatever arrives. */
function toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Timestamp) return value.toDate();
    if (value instanceof Date) return value;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function OrderRow({ order, showName = true }: OrderRowProps) {
    const pickedUpDate = toDate(order.pickedUpAt ?? order.kitchen?.pickedUpAt);
    const createdDate = toDate(order.createdAt);
    const isDone = order.status === 'Completed' || order.status === 'PICKED_UP';

    return (
        <div className={cn(
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
                    {showName && (
                        <h3 className="text-sm font-semibold text-gray-700">{order.userName || 'Guest'}</h3>
                    )}
                </div>
                <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">₹{order.totalPrice}</p>
                    {createdDate && (
                        <p className="text-[11px] font-medium text-gray-500 flex items-center justify-end gap-1 mt-0.5">
                            <Clock className="h-3 w-3" />
                            {format(createdDate, "h:mm a")}
                        </p>
                    )}
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
}
