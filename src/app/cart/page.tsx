"use client";

import { useCart } from "@/contexts/cart-provider";
import { useAuth } from "@/hooks/use-auth";
import { useRazorpay } from "@/hooks/use-razorpay";
import { useMenuItems } from "@/hooks/use-menu-items";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Minus, Trash2, ArrowLeft, ShoppingBag, Package, MessageSquare, AlertTriangle, ChevronRight, Lock, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { calculatePaymentBreakdown } from "@/lib/payment-fee";
import { calculateParcelCharge, type ParcelItem } from "@/lib/parcel-calc";
import { isNoParcelCategory, isContainerCategory, isBagCategory } from "@/lib/parcel-categories";

function isKitchenOpen(): boolean {
    // Convert UTC → IST (UTC+5:30) so the gate works regardless of device timezone.
    // Mirrors the server check in /api/razorpay/create-order.
    const now = new Date();
    const istMs = now.getTime() + (5 * 60 + 30) * 60_000;
    const ist = new Date(istMs);
    const total = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    return total >= 8 * 60 && total < 20 * 60 + 45;
}

export default function CartPage() {
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();
    const { items, isHydrated, totalItems, totalPrice, hasDailyItems, increment, decrement, removeItem, clearCart, getCheckoutItems, toggleItemParcel } = useCart();
    const [processing, setProcessing] = useState(false);

    const [withinHours, setWithinHours] = useState(() => isKitchenOpen());
    useEffect(() => {
        const id = setInterval(() => setWithinHours(isKitchenOpen()), 60_000);
        return () => clearInterval(id);
    }, []);

    const [orderingEnabled, setOrderingEnabled] = useState<boolean | null>(null);
    const [kitchen24x7, setKitchen24x7] = useState(false);
    useEffect(() => {
        const unsub = onSnapshot(
            doc(db, 'canteen_state', 'settings'),
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    const val = data?.studentOrderingEnabled;
                    setOrderingEnabled(typeof val === 'boolean' ? val : true);
                    setKitchen24x7(data?.kitchen24x7 === true);
                } else {
                    setOrderingEnabled(true);
                    setKitchen24x7(false);
                }
            },
            () => setOrderingEnabled(true), // on error, default to open
        );
        return () => unsub();
    }, []);
    const kitchenOpen = kitchen24x7 || withinHours;
    const [parcelSheetOpen, setParcelSheetOpen] = useState(false);
    const [note, setNote] = useState('');

    // Real-time availability check — fetch all active items (including unavailable ones)
    const { items: menuItems } = useMenuItems({ includeUnavailable: true });

    // Cross-reference cart items with live availability data
    const unavailableItemIds = useMemo(() => {
        const menuMap = new Map(menuItems.map(m => [m.id, m]));
        return new Set(
            items
                .filter(ci => {
                    const menuItem = menuMap.get(ci.itemId);
                    // If item is found and isAvailable is false → it's unavailable
                    return menuItem !== undefined && !menuItem.isAvailable;
                })
                .map(ci => ci.itemId)
        );
    }, [items, menuItems]);

    const hasUnavailableItems = unavailableItemIds.size > 0;

    // Razorpay checkout
    const { checkout: razorpayCheckout, loading: paymentLoading } = useRazorpay({
        onSuccess: (response) => {
            clearCart();
            // Store confirmation for the student dashboard toast
            sessionStorage.setItem('orderConfirmed', JSON.stringify({
                token: response.token,
                orderId: response.orderId,
            }));
            router.replace('/student');
        },
        onError: (error) => {
            toast({
                title: "Payment Failed",
                description: error,
                variant: "destructive",
            });
            setProcessing(false);
        },
        onCancel: () => {
            toast({
                title: "Payment Cancelled",
                description: "Your cart is still saved.",
            });
            setProcessing(false);
        },
        onPending: () => {
            // UPI app was opened — payment may still be processing in the background.
            // Keep the button disabled (processing=true) and show a non-alarming message.
            toast({
                title: "Verifying Payment",
                description: "Waiting for confirmation from your UPI app...",
            });
            // processing stays true → button stays disabled while we wait for webhook
        },
    });

    // Parcel charge breakdown using the shared calculation
    const parcelBreakdown = useMemo(() => {
        const parcelItems: ParcelItem[] = items.map(i => ({
            category: i.category,
            qty: i.qty,
            wantParcel: i.category === 'daily_menu' ? true : !!i.wantParcel,
        }));
        return calculateParcelCharge(parcelItems);
    }, [items]);

    const { totalParcelCharge: parcelCharge, isParcel, mainCourseParcel, containerParcel, bagParcel, dailyRegularsParcel } = parcelBreakdown;


    const platformCharges = 0; // Platform convenience charges (currently ₹0)
    // Target revenue = what Kanteen must net. Razorpay deducts 2.36%, so we
    // gross up the customer-facing total with calculatePaymentBreakdown.
    const targetRevenue = totalPrice + parcelCharge + platformCharges;
    const { gatewayFee, grossTotal: finalTotal } = calculatePaymentBreakdown(targetRevenue);

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

    if (orderingEnabled === null) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="h-12 w-12 bg-gray-200 rounded-full mb-4"></div>
                    <div className="h-4 w-32 bg-gray-200 rounded"></div>
                </div>
            </div>
        );
    }

    if (orderingEnabled === false) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
                <div className="text-center max-w-sm">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-orange-50 flex items-center justify-center">
                        <Wrench className="h-8 w-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-3">We&apos;ll be right back</h1>
                    <p className="text-gray-500 leading-relaxed">
                        We are adding some new features, see you soon
                    </p>
                    <p className="mt-4 text-primary font-bold text-lg">— Kanteen</p>
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
                {/* Unavailability warning banner */}
                {hasUnavailableItems && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-4 flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4"
                    >
                        <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold text-red-700 text-sm">
                                {unavailableItemIds.size} item{unavailableItemIds.size > 1 ? "s" : ""} no longer available
                            </p>
                            <p className="text-red-600 text-xs mt-0.5">
                                These items were made unavailable by the canteen. Remove them to proceed with checkout.
                            </p>
                        </div>
                    </motion.div>
                )}

                <div className="space-y-3">
                    {items.map((item, index) => {
                        const isItemUnavailable = unavailableItemIds.has(item.itemId);
                        return (
                        <motion.div
                            key={item.itemId}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className={`flex items-center gap-4 p-4 rounded-2xl shadow-sm border ${
                                isItemUnavailable
                                    ? "bg-red-50 border-red-200"
                                    : "bg-white border-gray-100"
                            }`}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className={`font-semibold break-words ${isItemUnavailable ? "text-red-700" : "text-gray-900"}`}>
                                        {item.name}
                                    </p>
                                    {isItemUnavailable && (
                                        <span className="text-xs font-bold bg-red-100 text-red-600 rounded-full px-2 py-0.5 uppercase tracking-wide">
                                            Unavailable
                                        </span>
                                    )}
                                </div>
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
                        );
                    })}
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

                        {/* Parcel Settings — tap to configure per-item */}
                        <Sheet open={parcelSheetOpen} onOpenChange={setParcelSheetOpen}>
                            <button
                                type="button"
                                onClick={() => setParcelSheetOpen(true)}
                                className={`w-full flex items-center justify-between px-3 py-3 rounded-xl border text-left transition-colors ${isParcel ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <Package className={`h-5 w-5 shrink-0 ${isParcel ? 'text-orange-500' : 'text-gray-500'}`} />
                                    <div className="flex flex-col">
                                        <span className="font-medium text-gray-900 text-sm">Parcel Settings</span>
                                        <span className={`text-xs ${isParcel ? 'text-orange-600 font-medium' : 'text-gray-400'}`}>
                                            {parcelCharge > 0
                                                ? `Packaging · +₹${parcelCharge}`
                                                : 'Tap to choose which items to pack'}
                                        </span>
                                    </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                            </button>

                            <SheetContent side="bottom" className="rounded-t-3xl pb-8 max-h-[80vh] overflow-y-auto">
                                <SheetHeader className="mb-4">
                                    <SheetTitle>Parcel Settings</SheetTitle>
                                    <SheetDescription>Select items to pack. Charges vary by item type.</SheetDescription>
                                </SheetHeader>

                                <div className="space-y-3">
                                    {items
                                        .filter(item => !isNoParcelCategory(item.category))
                                        .map((item) => {
                                        const isMainCourse = item.category === 'daily_menu';
                                        const isExtra = item.category === 'daily_regulars';
                                        const isContainer = isContainerCategory(item.category);
                                        const isBag = isBagCategory(item.category);
                                        const packed = isMainCourse || !!item.wantParcel;

                                        // Determine label text
                                        let costLabel: string;
                                        if (isMainCourse) {
                                            costLabel = 'Flat ₹5 packaging';
                                        } else if (isExtra) {
                                            if (hasDailyItems) {
                                                costLabel = 'Free (packed with Main Course)';
                                            } else {
                                                costLabel = 'Flat ₹5 for all extras';
                                            }
                                        } else if (isContainer) {
                                            const cost = 5 * item.qty;
                                            costLabel = item.wantParcel
                                                ? (item.qty > 1 ? `+₹${cost} (₹5 × ${item.qty})` : '+₹5')
                                                : '₹5/item';
                                        } else if (isBag) {
                                            costLabel = item.wantParcel ? '+₹5 flat' : 'Flat ₹5';
                                        } else {
                                            costLabel = packed ? 'Packed' : 'Not packed';
                                        }

                                        return (
                                            <div key={item.itemId} className={`flex items-center gap-3 p-3 rounded-2xl border ${packed ? 'bg-orange-50 border-orange-100' : 'bg-gray-50 border-gray-100'}`}>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {item.qty > 1 && `${item.qty}× · `}
                                                        {costLabel}
                                                    </p>
                                                </div>
                                                {isMainCourse ? (
                                                    <div className="flex items-center gap-1.5 text-orange-500">
                                                        <Lock className="h-3.5 w-3.5" />
                                                        <span className="text-xs font-medium">Always packed</span>
                                                    </div>
                                                ) : (
                                                    <Switch
                                                        checked={!!item.wantParcel}
                                                        onCheckedChange={() => toggleItemParcel(item.itemId)}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {parcelCharge > 0 && (
                                    <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                                        <span className="text-sm font-semibold text-gray-700">Total Packaging</span>
                                        <span className="text-base font-bold text-orange-600">+₹{parcelCharge}</span>
                                    </div>
                                )}
                            </SheetContent>
                        </Sheet>

                        {/* Kitchen Notes */}
                        <div className="px-2 py-3 bg-gray-50 rounded-xl border border-gray-200">
                            <div className="flex items-center gap-2 mb-2">
                                <MessageSquare className="h-4 w-4 text-gray-600" />
                                <span className="font-medium text-gray-900 text-sm">Kitchen Notes</span>
                                <span className="text-xs text-gray-400">(optional)</span>
                            </div>
                            <input
                                type="text"
                                placeholder="e.g., Make it spicy, less oil, no onion..."
                                value={note}
                                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                                className="w-full px-3 py-2 text-base bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                maxLength={200}
                            />
                            {note && (
                                <p className="text-xs text-gray-400 mt-1 text-right">{note.length}/200</p>
                            )}
                        </div>

                        {/* Price breakdown */}
                        <div className="space-y-1 px-2 pt-2 border-t border-gray-200">
                            <div className="flex justify-between text-sm text-gray-600">
                                <span>Subtotal ({totalItems} items)</span>
                                <span>₹{totalPrice}</span>
                            </div>
                            {mainCourseParcel > 0 && (
                                <div className="flex justify-between text-sm text-gray-600">
                                    <span>Main Course Packaging</span>
                                    <span>₹{mainCourseParcel}</span>
                                </div>
                            )}
                            {containerParcel > 0 && (
                                <div className="flex justify-between text-sm text-gray-600">
                                    <span>Container Packaging</span>
                                    <span>₹{containerParcel}</span>
                                </div>
                            )}
                            {bagParcel > 0 && (
                                <div className="flex justify-between text-sm text-gray-600">
                                    <span>Bag Packaging</span>
                                    <span>₹{bagParcel}</span>
                                </div>
                            )}
                            {dailyRegularsParcel > 0 && (
                                <div className="flex justify-between text-sm text-gray-600">
                                    <span>Extras Packaging</span>
                                    <span>₹{dailyRegularsParcel}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm text-gray-600">
                                <span>Platform Convenience Charges</span>
                                <span>₹{platformCharges}</span>
                            </div>
                            <div className="flex justify-between text-sm text-gray-600">
                                <span>Payment Gateway Fee</span>
                                <span>₹{gatewayFee.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2">
                                <span className="text-base font-bold text-gray-900">Total</span>
                                <span className="text-2xl font-bold text-gray-900">₹{finalTotal.toFixed(2)}</span>
                            </div>
                            <p className="text-[11px] text-gray-500 leading-snug pt-2">
                                Note: Kanteen does not profit from the Payment Gateway Fee. This 100% covers the mandatory processing and tax charges levied by our online payment provider, ensuring you can pay securely online.
                            </p>
                        </div>
                    </div>
                    {/* Unavailable warning above button */}
                    {hasUnavailableItems && (
                        <p className="text-xs text-center text-red-500 font-medium -mb-1">
                            Remove unavailable items before placing your order
                        </p>
                    )}

                    {/* Kitchen closed warning */}
                    {!kitchenOpen && !paymentLoading && (
                        <p className="text-xs text-center text-amber-600 font-medium -mb-1">
                            Kitchen is closed · Ordering available 8:00 AM – 8:45 PM
                        </p>
                    )}

                    <Button
                        className={`w-full h-14 text-base font-semibold rounded-2xl text-white transition-all ${
                            hasUnavailableItems || (!kitchenOpen && !paymentLoading)
                                ? "bg-gray-300 cursor-not-allowed shadow-none"
                                : "bg-primary hover:bg-primary/90 shadow-lg shadow-orange-200"
                        }`}
                        disabled={items.length === 0 || processing || paymentLoading || hasUnavailableItems || (!kitchenOpen && !paymentLoading)}
                        onClick={async () => {
                            if (hasUnavailableItems) return;
                            if (!user?.uid) {
                                toast({
                                    title: "Login Required",
                                    description: "Please login to complete your order.",
                                    variant: "destructive",
                                });
                                router.push('/order');
                                return;
                            }
                            setProcessing(true);
                            try {
                                const checkoutItems = getCheckoutItems();
                                await razorpayCheckout({
                                    items: checkoutItems,
                                    isParcel: isParcel,
                                    parcelCharge: parcelCharge,
                                    platformCharges: platformCharges,
                                    note: note.trim() || undefined,
                                });
                                // Success handled by onSuccess callback
                            } catch (error: any) {
                                // Error and cancel handled by callbacks
                                if (!error.message?.includes('cancelled')) {
                                    console.error("Checkout failed:", error);
                                }
                            }
                        }}
                    >
                        {processing || paymentLoading ? "Processing..." : hasUnavailableItems ? "Remove Unavailable Items" : !kitchenOpen ? "Kitchen Closed" : "Proceed to Pay"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
