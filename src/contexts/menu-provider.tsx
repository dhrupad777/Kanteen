"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { doc, collection, getDocs, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DailyMenu, MenuOptions } from "@/types";
import { useAuth } from "@/hooks/use-auth";

interface MenuContextType {
    menu: DailyMenu | null;
    options: MenuOptions;
    loading: boolean;
    updateMenu: (menuData: DailyMenu) => Promise<void>;
}

export const MenuContext = createContext<MenuContextType | undefined>(undefined);

export function MenuProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [menu, setMenu] = useState<DailyMenu | null>(null);
    // Default structure to avoid undefined errors before fetch
    const [options, setOptions] = useState<MenuOptions>({
        sabji: [], bread: [], dal: [], rice: [], snacks01: [], snacks02: [], specials: []
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 1. Fetch Options (One-time fetch usually sufficient, or could be realtime)
        async function fetchOptions() {
            try {
                const querySnapshot = await getDocs(collection(db, "menu_options"));
                const newOptions: MenuOptions = {};
                querySnapshot.forEach((doc) => {
                    // doc.id is category (e.g. 'sabji')
                    // doc.data().items is array
                    const data = doc.data();
                    if (Array.isArray(data.items)) {
                        newOptions[doc.id] = data.items;
                    }
                });

                // If empty (first run), we might want defaults, but for now just set what we found
                if (Object.keys(newOptions).length > 0) {
                    setOptions(prev => ({ ...prev, ...newOptions }));
                }
            } catch (err) {
                console.error("Error fetching menu options:", err);
            }
        }

        fetchOptions();

        // 2. Subscribe to Today's Menu
        const unsub = onSnapshot(doc(db, "canteen_state", "today"), (currDoc) => {
            if (currDoc.exists()) {
                setMenu(currDoc.data() as DailyMenu);
            } else {
                setMenu(null);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error listening to menu:", error);
            setLoading(false);
        });

        return () => unsub();
    }, []);

    const updateMenu = async (menuData: DailyMenu) => {
        if (!user) throw new Error("Unauthorized");

        await setDoc(doc(db, "canteen_state", "today"), {
            ...menuData,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid
        });
    };

    return (
        <MenuContext.Provider value={{ menu, options, loading, updateMenu }}>
            {children}
        </MenuContext.Provider>
    );
}

export function useMenu() {
    const context = useContext(MenuContext);
    if (context === undefined) {
        throw new Error("useMenu must be used within a MenuProvider");
    }
    return context;
}
