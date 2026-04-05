"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./use-auth";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "@/lib/auth";

const STAFF_ROLES = ["kitchen_staff", "kitchen_manager", "admin"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

interface StaffAuthResult {
    loading: boolean;
    isAuthenticated: boolean; // any valid staff role
    isOwner: boolean;         // kitchen_manager with isOwner custom claim
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
    const [isOwner, setIsOwner] = useState(false);
    const [claimsLoading, setClaimsLoading] = useState(true);

    useEffect(() => {
        if (authLoading) return;

        if (!user) {
            setRole(null);
            setIsOwner(false);
            setClaimsLoading(false);
            return;
        }

        // Try cached token first. If no role claim is present, force-refresh once —
        // this covers the case where custom claims were set after the user's last sign-in
        // (the cached ID token predates the claim update and won't have them).
        user.getIdTokenResult()
            .then((result) => {
                if (result.claims.role) return result;
                return user.getIdTokenResult(true); // force-refresh to pick up new claims
            })
            .then((result) => {
                const claimed = result.claims.role as string | undefined;
                const validRole = STAFF_ROLES.find((r) => r === claimed) ?? null;
                setRole(validRole);
                setIsOwner(validRole === 'kitchen_manager' && result.claims.isOwner === true);
            })
            .catch(() => { setRole(null); setIsOwner(false); })
            .finally(() => setClaimsLoading(false));
    }, [user, authLoading]);

    const loading = authLoading || claimsLoading;
    const isAuthenticated = !loading && role !== null;

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
