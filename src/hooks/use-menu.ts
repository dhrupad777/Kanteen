"use client";

import { useContext } from "react";
import { MenuContext } from "@/contexts/menu-provider";

export function useMenu() {
    const context = useContext(MenuContext);
    if (context === undefined) {
        throw new Error("useMenu must be used within a MenuProvider");
    }
    return context;
}
