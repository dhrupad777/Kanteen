"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { auth } from "@/lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, ShieldAlert, Lock } from "lucide-react";

function StaffLoginForm() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirect = searchParams.get("redirect") ?? "/kitchen";

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // If already signed in as staff, redirect away.
    // Force-refresh the token so newly-set custom claims (e.g. after set-owner-claims script)
    // are picked up without requiring the user to sign out and back in.
    useEffect(() => {
        if (authLoading || !user) return;
        user.getIdTokenResult()
            .then((result) => result.claims.role ? result : user.getIdTokenResult(true))
            .then((result) => {
                const role = result.claims.role as string | undefined;
                const staffRoles = ["kitchen_staff", "kitchen_manager", "admin"];
                if (role && staffRoles.includes(role)) {
                    router.replace(redirect);
                }
            });
    }, [user, authLoading, router, redirect]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!email.trim() || !password.trim()) {
            setError("Please enter your email and password.");
            return;
        }

        setError(null);
        setLoading(true);

        try {
            // Step 1: Verify credentials server-side. The API checks Firestore and calls
            // setCustomUserClaims(uid, { role, isOwner }) — no token-signing needed.
            const res = await fetch('/api/auth/staff-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), password }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error ?? "Invalid email or password.");
                return;
            }

            // Step 2: Sign in with Firebase Auth (email + password).
            // Claims were just set server-side; force-refresh the token to pick them up.
            const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
            await credential.user.getIdToken(true);

            router.replace(redirect);
        } catch (err: any) {
            setError(err?.message ?? "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
            <Card className="w-full max-w-sm border-2 border-primary/20 shadow-xl">
                <CardHeader className="text-center pb-4">
                    <div className="mx-auto bg-primary/10 p-3 rounded-full mb-3 w-fit">
                        <Lock className="h-7 w-7 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-headline">Staff Access</CardTitle>
                    <CardDescription className="text-sm">
                        Kanteen internal portal — authorised staff only.
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="flex items-start gap-2 bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                autoComplete="email"
                                placeholder="staff@kanteen.app"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={loading}
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                autoComplete="current-password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                                required
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full"
                            size="lg"
                            disabled={loading}
                        >
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {loading ? "Signing in…" : "Sign In"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

export default function StaffLoginPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        }>
            <StaffLoginForm />
        </Suspense>
    );
}
