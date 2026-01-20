"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { signInWithGoogle, checkManagerAllowlist, createManagerProfile, signOut, BYPASS_AUTH } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, ShieldAlert, BadgeCheck } from "lucide-react";
import { KanteenHeader } from "@/components/kanteen-header";

export default function ManagerLoginPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Auto-redirect when in test mode
    useEffect(() => {
        if (BYPASS_AUTH) {
            console.log("🔓 AUTH BYPASS: Auto-redirecting to /staff");
            router.push("/staff");
        }
    }, [router]);

    async function handleManagerSignIn() {
        setError(null);
        setVerifying(true);
        try {
            const googleUser = await signInWithGoogle();

            if (googleUser && googleUser.email) {
                const isAllowed = await checkManagerAllowlist(googleUser.email);

                if (isAllowed) {
                    await createManagerProfile(googleUser.uid, {
                        name: googleUser.displayName || "",
                        email: googleUser.email
                    });
                    router.push("/staff");
                } else {
                    setError("Access Denied: Your email is not on the manager allowlist.");
                    await signOut();
                }
            } else {
                setError("Email is required for manager access.");
                await signOut();
            }
        } catch (err) {
            console.error("Manager login error:", err);
            setError("Authentication failed. Please try again.");
        } finally {
            setVerifying(false);
        }
    }

    // Show loading while redirecting in bypass mode
    if (loading || BYPASS_AUTH) {
        return (
            <div className="flex flex-col min-h-screen">
                <KanteenHeader />
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-16 w-16 animate-spin text-primary" />
                </div>
            </div>
        );
    }

    return (
        <>
            <KanteenHeader />
            <div className="flex items-center justify-center min-h-screen bg-background -mt-20 p-4">
                <Card className="w-full max-w-sm border-2 border-primary/20">
                    <CardHeader className="text-center">
                        <div className="mx-auto bg-primary/10 p-3 rounded-full mb-2 w-fit">
                            <BadgeCheck className="h-8 w-8 text-primary" />
                        </div>
                        <CardTitle className="text-2xl font-headline">Manager Access</CardTitle>
                        <CardDescription>
                            Restricted area. Authorized personnel only.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {error && (
                            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
                                <ShieldAlert className="h-4 w-4 shrink-0" />
                                {error}
                            </div>
                        )}

                        <Button
                            className="w-full"
                            size="lg"
                            onClick={handleManagerSignIn}
                            disabled={verifying}
                        >
                            {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Sign in with Google
                        </Button>


                    </CardContent>
                </Card>
            </div>
        </>
    );
}
