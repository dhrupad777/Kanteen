"use client";

import { createContext, useContext, useReducer, useEffect, ReactNode, useCallback } from "react";
import { CartItem, MenuItem } from "@/types/menu-item";

const CART_STORAGE_KEY = "kanteen-cart";
const MAX_CART_ITEMS = 50; // Maximum number of items in cart
const MAX_CART_SIZE_BYTES = 100 * 1024; // 100KB max cart size in localStorage

// Cart state
interface CartState {
    items: CartItem[];
    isHydrated: boolean;
}

// Cart actions
type CartAction =
    | { type: "HYDRATE"; payload: CartItem[] }
    | { type: "ADD_ITEM"; payload: MenuItem }
    | { type: "REMOVE_ITEM"; payload: string }
    | { type: "INCREMENT"; payload: string }
    | { type: "DECREMENT"; payload: string }
    | { type: "CLEAR" };

// Reducer
function cartReducer(state: CartState, action: CartAction): CartState {
    switch (action.type) {
        case "HYDRATE":
            return { items: action.payload, isHydrated: true };

        case "ADD_ITEM": {
            const item = action.payload;

            // Validate item price to prevent invalid totals
            if (typeof item.price !== 'number' || isNaN(item.price)) {
                console.warn("Ignored item with invalid price:", item.name);
                return state;
            }

            const existing = state.items.find((i) => i.itemId === item.id);
            if (existing) {
                return {
                    ...state,
                    items: state.items.map((i) =>
                        i.itemId === item.id ? { ...i, qty: i.qty + 1 } : i
                    ),
                };
            }

            // Prevent cart from growing too large
            if (state.items.length >= MAX_CART_ITEMS) {
                console.warn(`Cart limit reached (${MAX_CART_ITEMS} items). Cannot add more items.`);
                return state;
            }

            return {
                ...state,
                items: [
                    ...state.items,
                    {
                        itemId: item.id,
                        name: item.name,
                        price: item.price,
                        qty: 1,
                        category: item.category,
                    },
                ],
            };
        }

        case "REMOVE_ITEM":
            return {
                ...state,
                items: state.items.filter((i) => i.itemId !== action.payload),
            };

        case "INCREMENT":
            return {
                ...state,
                items: state.items.map((i) =>
                    i.itemId === action.payload ? { ...i, qty: i.qty + 1 } : i
                ),
            };

        case "DECREMENT": {
            const item = state.items.find((i) => i.itemId === action.payload);
            if (!item) return state;
            if (item.qty <= 1) {
                return {
                    ...state,
                    items: state.items.filter((i) => i.itemId !== action.payload),
                };
            }
            return {
                ...state,
                items: state.items.map((i) =>
                    i.itemId === action.payload ? { ...i, qty: i.qty - 1 } : i
                ),
            };
        }

        case "CLEAR":
            return { ...state, items: [] };

        default:
            return state;
    }
}

// Checkout items format for Razorpay
interface CheckoutItem {
    itemId: string;
    name: string;
    qty: number;
    price: number;
}

// Context type
interface CartContextType {
    items: CartItem[];
    isHydrated: boolean;
    totalItems: number;
    totalPrice: number;
    /** True when the cart contains at least one daily-menu item (parcel must be forced ON). */
    hasDailyItems: boolean;
    addItem: (item: MenuItem) => void;
    removeItem: (itemId: string) => void;
    increment: (itemId: string) => void;
    decrement: (itemId: string) => void;
    clearCart: () => void;
    getItemQty: (itemId: string) => number;
    getCheckoutItems: () => CheckoutItem[];
}

const CartContext = createContext<CartContextType | null>(null);

// Provider
export function CartProvider({ children }: { children: ReactNode }) {
    // Lazy initialization - reads from localStorage synchronously on mount
    const [state, dispatch] = useReducer(cartReducer, null, () => {
        // Prevent access to localStorage during SSR
        if (typeof window === "undefined") {
            return { items: [], isHydrated: false };
        }

        try {
            const stored = localStorage.getItem(CART_STORAGE_KEY);
            if (stored) {
                // Check storage size limit
                if (stored.length > MAX_CART_SIZE_BYTES) {
                    console.warn('Cart data exceeds size limit, clearing...');
                    localStorage.removeItem(CART_STORAGE_KEY);
                    return { items: [], isHydrated: true };
                }

                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    // Filter invalid items and enforce limits
                    const validItems = parsed
                        .filter((i: any) =>
                            typeof i.price === 'number' &&
                            !isNaN(i.price) &&
                            typeof i.itemId === 'string' &&
                            typeof i.name === 'string' &&
                            typeof i.qty === 'number'
                        )
                        .slice(0, MAX_CART_ITEMS); // Enforce item limit

                    if (validItems.length !== parsed.length) {
                        console.warn(`Removed ${parsed.length - validItems.length} invalid/excess items from cart`);
                    }
                    return { items: validItems, isHydrated: true };
                }
            }
        } catch (e) {
            console.warn("Failed to parse cart from localStorage", e);
            // Clear corrupted data
            try {
                localStorage.removeItem(CART_STORAGE_KEY);
            } catch { }
        }
        return { items: [], isHydrated: true };
    });

    // Persist to localStorage on change
    useEffect(() => {
        if (state.isHydrated) {
            try {
                localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.items));
            } catch (e) {
                console.warn("Failed to save cart to localStorage", e);
            }
        }
    }, [state.items, state.isHydrated]);

    // Computed values
    const hasDailyItems = state.items.some(item => item.category === 'daily_menu');
    const totalItems = state.items.reduce((sum, item) => sum + item.qty, 0);
    const totalPrice = state.items.reduce((sum, item) => {
        if (!item.price || isNaN(item.price)) {
            console.error(`Item ${item.name} has invalid price:`, item.price);
            return sum;
        }
        return sum + item.price * item.qty;
    }, 0);

    // Actions
    const addItem = useCallback((item: MenuItem) => {
        dispatch({ type: "ADD_ITEM", payload: item });
    }, []);

    const removeItem = useCallback((itemId: string) => {
        dispatch({ type: "REMOVE_ITEM", payload: itemId });
    }, []);

    const increment = useCallback((itemId: string) => {
        dispatch({ type: "INCREMENT", payload: itemId });
    }, []);

    const decrement = useCallback((itemId: string) => {
        dispatch({ type: "DECREMENT", payload: itemId });
    }, []);

    const clearCart = useCallback(() => {
        dispatch({ type: "CLEAR" });
    }, []);

    const getCheckoutItems = useCallback((): CheckoutItem[] => {
        return state.items.map(item => ({
            itemId: item.itemId,
            name: item.name,
            qty: item.qty,
            price: item.price,
        }));
    }, [state.items]);

    const getItemQty = useCallback(
        (itemId: string) => {
            const item = state.items.find((i) => i.itemId === itemId);
            return item?.qty ?? 0;
        },
        [state.items]
    );

    return (
        <CartContext.Provider
            value={{
                items: state.items,
                isHydrated: state.isHydrated,
                totalItems,
                totalPrice,
                hasDailyItems,
                addItem,
                removeItem,
                increment,
                decrement,
                clearCart,
                getItemQty,
                getCheckoutItems,
            }}
        >
            {children}
        </CartContext.Provider>
    );
}

// Hook
export function useCart() {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error("useCart must be used within a CartProvider");
    }
    return context;
}
