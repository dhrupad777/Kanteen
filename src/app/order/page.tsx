"use client";

import { useState, useMemo, lazy, Suspense, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { signInWithGoogle, isInAppBrowser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ArrowLeft, Utensils, Coffee, Soup, Sandwich, Disc, CircleDot, ChefHat, UtensilsCrossed, Carrot, Spline, Clock, Loader2, Wrench } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Order-specific imports
import { useCart } from "@/contexts/cart-provider";
import { useMenuItems } from "@/hooks/use-menu-items";
import { useRazorpay } from "@/hooks/use-razorpay";
import { MenuItemCard } from "@/components/order/menu-item-card";
import { MENU_CATEGORIES, MenuCategory, MenuItem } from "@/types/menu-item";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { OrderPageSkeleton, CategoryCardSkeleton } from "@/components/skeletons";

// Lazy load heavy components for better initial load
const CategoryDialog = lazy(() => import("@/components/order/category-dialog").then(m => ({ default: m.CategoryDialog })));
const CartPanel = lazy(() => import("@/components/order/cart-panel").then(m => ({ default: m.CartPanel })));
const CartBottomBar = lazy(() => import("@/components/order/cart-bottom-bar").then(m => ({ default: m.CartBottomBar })));

// Icon Mapping
const CATEGORY_ICONS: Record<MenuCategory, any> = {
    'tea_beverage': Coffee,
    'maggie': Soup,
    'sandwich': Sandwich,
    'dosa': CircleDot,
    'uttapam': Disc,
    'rava_dosa': Spline,
    'paratha': ChefHat,
    'chinese': UtensilsCrossed,
    'sabji': Carrot,
    'indian_rice': Utensils,
    'daily_menu': Utensils,
    'daily_regulars': Utensils,
};

// Image Mapping (Overrides icons if present)
const CATEGORY_IMAGES: Partial<Record<MenuCategory, string>> = {
    'daily_menu': '/icons/main.course.png',
    'daily_regulars': '/icons/extra.png',
    'tea_beverage': '/icons/tea_beverage.png',
    'chinese': '/icons/chinese.png',
    'dosa': '/icons/dosa.png',
    'indian_rice': '/icons/indian_rice.png',
    'maggie': '/icons/maggie.png',
    'paratha': '/icons/paratha.png',
    'rava_dosa': '/icons/rava_dosa.png',
    'sabji': '/icons/sabji.png',
    'sandwich': '/icons/sandwich.png',
    'uttapam': '/icons/uttapam.png',
};

/** Kitchen is open 8:00 AM – 8:45 PM */
function isKitchenOpen(): boolean {
    const now = new Date();
    const total = now.getHours() * 60 + now.getMinutes();
    return total >= 8 * 60 && total < 20 * 60 + 45; // 480 – 1245 minutes
}

function OrderContent() {
    const { user, userProfile, loading, processingRedirect } = useAuth();
    const router = useRouter();

    // Kitchen hours gate — re-evaluated every minute so the page auto-updates
    const [kitchenOpen, setKitchenOpen] = useState(() => isKitchenOpen());
    useEffect(() => {
        const id = setInterval(() => setKitchenOpen(isKitchenOpen()), 60_000);
        return () => clearInterval(id);
    }, []);

    // Online ordering toggle — controlled from /counter
    const [orderingEnabled, setOrderingEnabled] = useState<boolean | null>(null);
    useEffect(() => {
        const unsub = onSnapshot(
            doc(db, 'canteen_state', 'settings'),
            (snap) => setOrderingEnabled(snap.exists() ? snap.data().studentOrderingEnabled !== false : true),
            () => setOrderingEnabled(true),
        );
        return () => unsub();
    }, []);
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState("");
    const debouncedSearchQuery = useDebounce(searchQuery, 300);

    // In-app browser (Instagram, Facebook, etc.) — detected once on mount
    const [inAppBrowser] = useState(() => typeof window !== 'undefined' && isInAppBrowser());

    // Menu items — only show items that are currently available
    const { items: menuItems, loading: menuLoading, error: menuError } = useMenuItems({ includeUnavailable: false });

    // Cart
    const { totalItems, totalPrice, hasDailyItems, specialParcelCharge, hasNormalItems, getCheckoutItems, clearCart } = useCart();

    // UPI pending state — shown when user leaves via a UPI app and hasn't confirmed yet
    const [paymentPending, setPaymentPending] = useState(false);

    // Razorpay
    const { checkout: razorpayCheckout, loading: paymentLoading } = useRazorpay({
        onSuccess: (response) => {
            setPaymentPending(false);
            clearCart();
            sessionStorage.setItem('orderConfirmed', JSON.stringify({
                token: response.token,
                orderId: response.orderId,
            }));
            router.replace('/student');
        },
        onError: (error) => {
            setPaymentPending(false);
            const isVerificationError = error.toLowerCase().includes('verification') || error.toLowerCase().includes('verify');
            toast({
                title: isVerificationError ? "Payment verification failed" : "Payment failed",
                description: isVerificationError
                    ? `${error}. If money was deducted, it will be refunded within 5–7 business days. Contact canteen staff with your payment ID.`
                    : error,
                variant: "destructive",
            });
        },
        onCancel: () => {
            setPaymentPending(false);
            toast({
                title: "Payment cancelled",
                description: "You cancelled the payment. Your cart is still saved.",
            });
        },
        onPending: () => {
            // UPI app switch — modal closed but payment may still be processing.
            // Keep page visible and show a waiting overlay; Firestore listener will
            // redirect to /student once the webhook confirms the payment.
            setPaymentPending(true);
        },
    });

    async function handleGoogleSignIn() {
        try {
            await signInWithGoogle();
            // Popup: onAuthStateChanged fires → auth context updates → this page re-renders
            //        showing the menu directly. No manual navigation needed.
            // Redirect fallback (popup-blocked): page navigates away to Google; auth-provider
            //        handles the result on return.
        } catch (error: any) {
            console.error("Sign in failed", error);
            if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
                return;
            }
            toast({
                title: "Sign in failed",
                description: error?.message || "Could not sign in with Google. Please try again.",
                variant: "destructive",
            });
        }
    }

    async function handleCheckout() {
        if (totalItems === 0) {
            toast({
                title: "Cart is empty",
                description: "Add some items before proceeding to checkout.",
                variant: "destructive",
            });
            return;
        }

        if (!user?.uid) {
            toast({
                title: "Authentication required",
                description: "Please sign in to complete your order.",
                variant: "destructive",
            });
            return;
        }

        try {
            const checkoutItems = getCheckoutItems();
            const parcelCharge = specialParcelCharge + (hasDailyItems && hasNormalItems ? 5 : 0);
            await razorpayCheckout({
                items: checkoutItems,
                isParcel: hasDailyItems,
                parcelCharge,
                platformCharges: 0,
            });
            // Success is handled by onSuccess callback
        } catch (error: any) {
            // Error and cancel are handled by callbacks
            if (!error.message?.includes('cancelled')) {
                console.error("Checkout failed", error);
            }
        }
    }

    // Filter items by debounced search query (memoized for performance)
    const filteredItems = useMemo(() => {
        if (!debouncedSearchQuery) return [];
        const query = debouncedSearchQuery.toLowerCase();
        return menuItems.filter((item) =>
            item.name.toLowerCase().includes(query)
        );
    }, [menuItems, debouncedSearchQuery]);

    // Group items for category view (memoized for performance)
    const groupedItems = useMemo(() => {
        return MENU_CATEGORIES.reduce((acc, cat) => {
            acc[cat.value] = menuItems.filter(item => item.category === cat.value && item.isActive);
            return acc;
        }, {} as Record<MenuCategory, MenuItem[]>);
    }, [menuItems]);

    // Loading state - processingRedirect guards against the brief "Sign in" flash
    // that can appear if onAuthStateChanged fires null before the redirect result resolves.
    if (loading || processingRedirect || orderingEnabled === null) {
        return <OrderPageSkeleton />;
    }

    // Maintenance mode — toggled from /counter dashboard
    if (orderingEnabled === false && !paymentLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
                <div className="text-center max-w-sm">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-orange-50 flex items-center justify-center">
                        <Wrench className="h-8 w-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-3">We'll be right back</h1>
                    <p className="text-gray-500 leading-relaxed">
                        We are adding some new features, see you soon
                    </p>
                    <p className="mt-4 text-primary font-bold text-lg">— Kanteen</p>
                </div>
            </div>
        );
    }

    // Kitchen hours gate — 8:00 AM to 8:45 PM
    // Never interrupt an active payment flow (user opened Razorpay before cutoff)
    if (!kitchenOpen && !paymentLoading) {
        const now = new Date();
        const isTooEarly = now.getHours() < 8;
        const nextOpenLabel = isTooEarly ? 'Opens today at 8:00 AM' : 'Opens tomorrow at 8:00 AM';

        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-[22px] bg-gray-100 flex items-center justify-center">
                    <Clock className="h-10 w-10 text-gray-400" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Kitchen is Closed</h1>
                <p className="text-gray-500 mb-1">
                    Online ordering is available <span className="font-semibold text-gray-700">8:00 AM – 8:45 PM</span>.
                </p>
                <p className="text-sm text-gray-400 mb-8">{nextOpenLabel}</p>
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Go back
                </button>
            </div>
        );
    }

    // State 1: Not Signed In
    if (!user) {
        // In-app browser (Instagram, Facebook, Snapchat, Telegram, etc.)
        // Both popup and redirect are broken inside these browsers.
        // Show a clear instruction to open in a real browser instead.
        if (inAppBrowser) {
            return (
                <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
                    <div className="w-full max-w-sm text-center">
                        <div className="w-20 h-20 mx-auto mb-8 rounded-[22px] bg-primary flex items-center justify-center shadow-lg shadow-orange-200">
                            <Utensils className="h-10 w-10 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">Open in your browser</h1>
                        <p className="text-gray-500 mb-6">
                            Google sign-in doesn&apos;t work inside apps like Instagram or Facebook.
                        </p>
                        <p className="text-gray-400 text-sm mb-8">
                            Tap the <span className="font-semibold text-gray-600">&#8942;</span> menu (or share icon) and choose <span className="font-semibold text-gray-600">&ldquo;Open in Chrome&rdquo;</span> or <span className="font-semibold text-gray-600">&ldquo;Open in Safari&rdquo;</span>.
                        </p>
                        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 text-sm text-orange-800 font-mono break-all select-all">
                            kanteen-mrc-live.web.app/order
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
                <div className="w-full max-w-sm text-center">
                    {/* Icon */}
                    <div className="w-20 h-20 mx-auto mb-8 rounded-[22px] bg-primary flex items-center justify-center shadow-lg shadow-orange-200">
                        <Utensils className="h-10 w-10 text-white" />
                    </div>

                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">
                        Order Online
                    </h1>
                    <p className="text-gray-500 mb-8">
                        You need to Sign in with Google to Order Food online in MRC
                    </p>

                    <div className="space-y-3">
                        <button
                            onClick={handleGoogleSignIn}
                            className={cn(
                                "w-full h-14 flex items-center justify-center gap-3",
                                "bg-white border border-gray-200 rounded-2xl shadow-sm",
                                "text-gray-700 text-base font-semibold",
                                "hover:bg-gray-50 hover:shadow-md active:scale-[0.98]",
                                "transition-all duration-200"
                            )}
                        >
                            {/* Official Google coloured logo */}
                            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            Continue with Google
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // State 2: Fully Authenticated -> Order Page
    return (
        <div className="min-h-screen bg-gray-50 pb-28 md:pb-6 overflow-x-hidden">
            {/* UPI payment pending overlay */}
            {paymentPending && !paymentLoading && (
                <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-6 text-center">
                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                    <h2 className="text-xl font-bold text-gray-900">Verifying Payment</h2>
                    <p className="text-gray-500 text-sm max-w-xs">
                        Your UPI payment is being confirmed. Please don&apos;t close this page.
                    </p>
                    <p className="text-xs text-gray-400">
                        This usually takes a few seconds. You&apos;ll be redirected automatically.
                    </p>
                </div>
            )}
            {/* Header */}
            <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-gray-100 safe-area-top">
                <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
                    <div className="flex items-center justify-between gap-2 sm:gap-4">
                        <Link
                            href="/student"
                            className="flex items-center gap-1 sm:gap-2 text-gray-500 hover:text-primary transition-colors shrink-0"
                        >
                            <ArrowLeft className="h-5 w-5" />
                            <span className="text-xs sm:text-sm font-medium hidden sm:inline">Back</span>
                        </Link>

                        <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight truncate">
                            Kanteen
                        </h1>

                        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                            {(userProfile?.photoURL || user?.photoURL) && (
                                <img
                                    src={userProfile?.photoURL || user?.photoURL || ''}
                                    alt=""
                                    referrerPolicy="no-referrer"
                                    className="h-7 w-7 sm:h-8 sm:w-8 rounded-full border border-gray-200"
                                />
                            )}
                            <span className="text-xs sm:text-sm text-gray-600 font-medium max-w-[90px] sm:max-w-[140px] truncate">
                                {userProfile?.name?.split(' ')[0] || user?.displayName?.split(' ')[0]}
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
                <div className="flex gap-4 md:gap-8">
                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                        {/* Search */}
                        <div className="relative mb-4 sm:mb-6">
                            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                            <Input
                                placeholder="Search for items..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className={cn(
                                    "h-10 sm:h-12 pl-10 sm:pl-12 pr-3 sm:pr-4 text-base rounded-xl sm:rounded-2xl",
                                    "bg-white border-gray-200 shadow-sm",
                                    "focus:ring-2 focus:ring-primary focus:border-transparent",
                                    "placeholder:text-gray-400"
                                )}
                            />
                        </div>

                        {/* Error state */}
                        {menuError && (
                            <div className="p-6 bg-red-50 rounded-2xl text-center mb-6">
                                <p className="text-red-600 font-medium">Failed to load menu</p>
                                <p className="text-red-500 text-sm mt-1">{menuError}</p>
                            </div>
                        )}

                        {/* Loading State - Category skeletons */}
                        {menuLoading && (
                            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                                    <CategoryCardSkeleton key={i} />
                                ))}
                            </div>
                        )}



                        {/* Content */}
                        {!menuLoading && !menuError && (
                            <>
                                {debouncedSearchQuery ? (
                                    /* Search Results View */
                                    <div className="space-y-4">
                                        <h2 className="text-lg font-semibold text-gray-900">
                                            Search Results ({filteredItems.length})
                                        </h2>
                                        {filteredItems.length === 0 ? (
                                            <div className="text-center py-12 bg-white rounded-3xl border border-gray-100">
                                                <p className="text-gray-500">No items found matching "{searchQuery}"</p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                                {filteredItems.map((item) => (
                                                    <MenuItemCard key={item.id} item={item} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* Category Grid View */
                                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                                        {MENU_CATEGORIES.map((cat) => {
                                            const items = groupedItems[cat.value] || [];
                                            if (items.length === 0) return null;

                                            return (
                                                <Suspense key={cat.value} fallback={<CategoryCardSkeleton />}>
                                                    <CategoryDialog
                                                        category={cat.value}
                                                        label={cat.label}
                                                        items={items}
                                                        icon={CATEGORY_ICONS[cat.value]}
                                                        image={CATEGORY_IMAGES[cat.value]}
                                                    />
                                                </Suspense>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Cart Panel (Desktop) - Lazy loaded */}
                    <div className="hidden md:block w-80 shrink-0">
                        <div className="sticky top-24">
                            <Suspense fallback={
                                <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm animate-pulse">
                                    <div className="h-6 w-24 bg-gray-200 rounded mb-4" />
                                    <div className="h-24 bg-gray-100 rounded-xl" />
                                </div>
                            }>
                                <CartPanel onCheckout={handleCheckout} />
                            </Suspense>
                        </div>
                    </div>
                </div>
            </div>

            {/* Cart Bottom Bar (Mobile) - Lazy loaded */}
            <Suspense fallback={null}>
                <CartBottomBar className="hide-when-dialog-open" />
            </Suspense>
        </div>
    );
}

// Main export (using global CartProvider from layout)
export default function OrderPage() {
    return <OrderContent />;
}
