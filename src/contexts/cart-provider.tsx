"use client";

import { createContext, useContext, useReducer, useEffect, ReactNode, useCallback } from "react";
import { CartItem, MenuItem } from "@/types/menu-item";

const CART_STORAGE_KEY = "kanteen-cart";

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
            const existing = state.items.find((i) => i.itemId === item.id);
            if (existing) {
                return {
                    ...state,
                    items: state.items.map((i) =>
                        i.itemId === item.id ? { ...i, qty: i.qty + 1 } : i
                    ),
                };
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

// Context type
interface CartContextType {
    items: CartItem[];
    isHydrated: boolean;
    totalItems: number;
    totalPrice: number;
    addItem: (item: MenuItem) => void;
    removeItem: (itemId: string) => void;
    increment: (itemId: string) => void;
    decrement: (itemId: string) => void;
    clearCart: () => void;
    checkout: (studentId: string) => Promise<{ orderId: string, token: number; otp: string }>;
    getItemQty: (itemId: string) => number;
}

const CartContext = createContext<CartContextType | null>(null);

// Helper for hashing
async function hashOTP(otp: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(otp);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    return { items: parsed, isHydrated: true };
                }
            }
        } catch (e) {
            console.warn("Failed to parse cart from localStorage", e);
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
    const totalItems = state.items.reduce((sum, item) => sum + item.qty, 0);
    const totalPrice = state.items.reduce((sum, item) => sum + item.price * item.qty, 0);

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

    const checkout = useCallback(async (studentId: string) => {
        const { auth } = await import("@/lib/firebase");

        const user = auth.currentUser;
        if (!user) throw new Error("Not authenticated");

        const idToken = await user.getIdToken();

        const response = await fetch('/api/orders/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                items: state.items.map(i => ({
                    name: i.name,
                    qty: i.qty,
                    price: i.price
                })),
                totalPrice,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Checkout failed');
        }

        const result = await response.json();

        // Clear cart after success
        clearCart();

        return result; // contains { orderId, token, otp }
    }, [state.items, totalPrice, clearCart]);

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
                addItem,
                removeItem,
                increment,
                decrement,
                clearCart,
                checkout,
                getItemQty,
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
