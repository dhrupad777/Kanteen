"use client";

import { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { MenuItem, MenuCategory } from "@/types/menu-item";

interface UseMenuItemsOptions {
    category?: MenuCategory | null;
    includeUnavailable?: boolean;
}

interface UseMenuItemsReturn {
    items: MenuItem[];
    loading: boolean;
    error: string | null;
}

/**
 * Hook to fetch orderable menu items from the `menu_items` collection.
 * Filters by isActive=true and optionally by category.
 */
export function useMenuItems(options: UseMenuItemsOptions = {}): UseMenuItemsReturn {
    const { category, includeUnavailable = true } = options;
    const [items, setItems] = useState<MenuItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);

        try {
            const menuRef = collection(db, "menu_items");

            // Build query - only active items
            let q = query(
                menuRef,
                where("isActive", "==", true),
                orderBy("sortOrder", "asc")
            );

            // Note: Firestore requires composite index for multiple where + orderBy
            // If this errors, create the index in Firebase Console

            const unsubscribe = onSnapshot(
                q,
                (snapshot) => {
                    const fetchedItems: MenuItem[] = [];
                    snapshot.forEach((doc) => {
                        const data = doc.data();
                        fetchedItems.push({
                            id: doc.id,
                            name: data.name,
                            price: data.price,
                            category: data.category,
                            isActive: data.isActive,
                            isAvailable: data.isAvailable,
                            sortOrder: data.sortOrder,
                            tags: data.tags || [],
                            imageUrl: data.imageUrl || "",
                            updatedAt: data.updatedAt,
                        });
                    });

                    // Filter by category client-side (simpler, avoids multiple composite indexes)
                    let filtered = fetchedItems;
                    if (category) {
                        filtered = filtered.filter((item) => item.category === category);
                    }

                    // Optionally filter out unavailable items
                    if (!includeUnavailable) {
                        filtered = filtered.filter((item) => item.isAvailable);
                    }

                    setItems(filtered);
                    setLoading(false);
                },
                (err) => {
                    console.error("Error fetching menu items:", err);
                    setError(err.message);
                    setLoading(false);
                }
            );

            return () => unsubscribe();
        } catch (err: any) {
            console.error("Error setting up menu items listener:", err);
            setError(err.message);
            setLoading(false);
        }
    }, [category, includeUnavailable]);

    return { items, loading, error };
}
