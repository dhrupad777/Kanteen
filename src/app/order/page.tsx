"use client";

import { useEffect, useState, useMemo, lazy, Suspense } from "react";
import { useAuth } from "@/hooks/use-auth";
import { signInWithGoogle, createStudentProfile, checkStudentProfileExists } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ArrowLeft, Utensils, Coffee, Soup, Sandwich, Disc, CircleDot, ChefHat, UtensilsCrossed, Carrot, Spline } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useRouter } from "next/navigation";

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
    'indian_rice': Utensils
};

// Image Mapping (Overrides icons if present)
const CATEGORY_IMAGES: Partial<Record<MenuCategory, string>> = {
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

function OrderContent() {
    const { user, userProfile, loading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [name, setName] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const debouncedSearchQuery = useDebounce(searchQuery, 300); // Debounce search for performance

    // Profile checking
    const [checkingProfile, setCheckingProfile] = useState(true);
    const [profileExists, setProfileExists] = useState(false);

    // Menu items — only show items that are currently available
    const { items: menuItems, loading: menuLoading, error: menuError } = useMenuItems({ includeUnavailable: false });

    // Cart
    const { totalItems, totalPrice, getCheckoutItems, clearCart } = useCart();

    // Razorpay
    const { checkout: razorpayCheckout, loading: paymentLoading } = useRazorpay({
        onSuccess: (response) => {
            // OTP is now generated when order is marked "Ready" by staff, not at payment time
            clearCart();
            // Save order confirmation for dashboard toast (skip confirmation page)
            sessionStorage.setItem('orderConfirmed', JSON.stringify({
                token: response.token,
                orderId: response.orderId,
            }));
            router.push('/student');
        },
        onError: (error) => {
            // Distinguish verification failures (money may have been taken) from payment failures (money not taken)
            const isVerificationError = error.toLowerCase().includes('verification') || error.toLowerCase().includes('verify');
            toast({
                title: isVerificationError ? "Payment verification failed" : "Payment failed",
                description: isVerificationError
                    ? `${error}. If money was deducted, it will be refunded within 5–7 business days. Contact canteen staff with your payment ID.`
                    : error,
                variant: "destructive",
            });
            setSubmitting(false);
        },
        onCancel: () => {
            toast({
                title: "Payment cancelled",
                description: "You cancelled the payment. Your cart is still saved.",
            });
            setSubmitting(false);
        },
    });

    useEffect(() => {
        if (loading) return;
        if (!user) {
            setCheckingProfile(false);
            return;
        }
        // auth-provider already created/synced the Firestore profile on sign-in.
        // userProfile being non-null means it's ready; a null userProfile with a
        // uid means the doc write is still in-flight — treat that as "exists" too
        // so we don't show the name form for valid Google users.
        if (userProfile) {
            setProfileExists(true);
            setCheckingProfile(false);
        } else {
            // Doc may still be writing; fall back to a direct check
            checkStudentProfileExists(user.uid).then((exists) => {
                setProfileExists(exists);
                setCheckingProfile(false);
            }).catch(() => setCheckingProfile(false));
        }
    }, [user, userProfile, loading]);

    async function handleGoogleSignIn() {
        try {
            const result = await signInWithGoogle();
            // Desktop popup: result is the user — navigate to dashboard
            // Mobile redirect: result is null (page navigates away); auth-provider handles the redirect
            if (result) {
                router.replace('/student');
            }
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

    async function handleNameSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || !name.trim()) return;

        setSubmitting(true);
        try {
            await createStudentProfile(user.uid, {
                name: name.trim(),
                email: user.email || "",
                photoURL: user.photoURL || ""
            });
            setProfileExists(true);
        } catch (error: any) {
            console.error("Error creating profile:", error);
            toast({
                title: "Setup failed",
                description: "Could not save your name. Please check your connection and try again.",
                variant: "destructive",
            });
        } finally {
            setSubmitting(false);
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

        setSubmitting(true);
        try {
            const checkoutItems = getCheckoutItems();
            await razorpayCheckout({
                items: checkoutItems,
                isParcel: false,
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

    // Loading state - show skeleton for better perceived performance
    if (loading || checkingProfile) {
        return <OrderPageSkeleton />;
    }

    // State 1: Not Signed In - Orange Theme
    if (!user) {
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
                        Sign in to browse the menu and place your order
                    </p>

                    <div className="space-y-3">
                        <Button
                            className={cn(
                                "w-full h-14 text-base font-semibold rounded-2xl",
                                "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md",
                                "transition-all duration-200"
                            )}
                            onClick={handleGoogleSignIn}
                        >
                            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Continue with Google
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // State 2: Signed In, Missing Name - Orange Theme
    if (!profileExists && !userProfile) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
                <div className="w-full max-w-sm">
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2 text-center">
                        Welcome! 👋
                    </h1>
                    <p className="text-gray-500 mb-8 text-center">
                        What should we call you?
                    </p>

                    <form onSubmit={handleNameSubmit} className="space-y-4">
                        <div>
                            <Input
                                id="name"
                                placeholder="Enter your name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                minLength={2}
                                className={cn(
                                    "h-14 text-base px-4 rounded-2xl border-gray-200",
                                    "focus:ring-2 focus:ring-primary focus:border-transparent"
                                )}
                            />
                        </div>
                        <Button
                            type="submit"
                            className={cn(
                                "w-full h-14 text-base font-semibold rounded-2xl",
                                "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
                            )}
                            disabled={submitting}
                        >
                            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Continue
                        </Button>
                    </form>
                </div>
            </div>
        );
    }

    // State 3: Fully Authenticated -> Order Page
    return (
        <div className="min-h-screen bg-gray-50 pb-28 md:pb-6 overflow-x-hidden">
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
                            <span className="text-xs sm:text-sm text-gray-600 font-medium hidden sm:inline max-w-[80px] truncate">
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
                                    "h-10 sm:h-12 pl-10 sm:pl-12 pr-3 sm:pr-4 text-sm sm:text-base rounded-xl sm:rounded-2xl",
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
