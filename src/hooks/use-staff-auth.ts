"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./use-auth";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "@/lib/auth";

const STAFF_ROLES = ["kitchen_staff", "kitchen_manager", "admin"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

const OWNER_EMAIL = "dhrupadrajpurohit@gmail.com";

interface StaffAuthResult {
    loading: boolean;
    isAuthenticated: boolean; // any valid staff role
    isOwner: boolean;         // kitchen_manager AND owner email
    email: string | null;
    role: StaffRole | null;
    signOutStaff: () => Promise<void>;
}

/**
 * useStaffAuth
 *
 * Reads the `role` custom claim from the Firebase ID token.
 * The claim is set when the user signs in via /staff-login (custom token flow).
 *
 * - isAuthenticated: true if role is kitchen_staff, kitchen_manager, or admin
 * - isOwner: true if role is kitchen_manager AND email is the owner address
 *
 * If not authenticated, redirects to /staff-login?redirect=<current path>.
 */
export function useStaffAuth(): StaffAuthResult {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    const [role, setRole] = useState<StaffRole | null>(null);
    const [claimsLoading, setClaimsLoading] = useState(true);

    useEffect(() => {
        if (authLoading) return;

        if (!user) {
            setRole(null);
            setClaimsLoading(false);
            return;
        }

        user.getIdTokenResult()
            .then((result) => {
                const claimed = result.claims.role as string | undefined;
                const validRole = STAFF_ROLES.find((r) => r === claimed) ?? null;
                setRole(validRole);
            })
            .catch(() => setRole(null))
            .finally(() => setClaimsLoading(false));
    }, [user, authLoading]);

    const loading = authLoading || claimsLoading;
    const isAuthenticated = !loading && role !== null;
    const isOwner = isAuthenticated &&
        role === "kitchen_manager" &&
        user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();

    // Redirect to login if not authenticated once loading is done
    useEffect(() => {
        if (loading) return;
        if (!isAuthenticated) {
            router.replace(`/staff-login?redirect=${encodeURIComponent(pathname)}`);
        }
    }, [loading, isAuthenticated, router, pathname]);

    async function signOutStaff() {
        await signOut();
        router.replace("/staff-login");
    }

    return {
        loading,
        isAuthenticated,
        isOwner,
        email: user?.email ?? null,
        role,
        signOutStaff,
    };
}
