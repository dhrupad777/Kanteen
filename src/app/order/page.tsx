"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { signInWithGoogle, createStudentProfile, checkStudentProfileExists } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Chrome, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";

export default function OrderPage() {
    const { user, userProfile, loading } = useAuth();
    const router = useRouter();
    const [name, setName] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // If user is already authenticated and has a profile, show the "Coming Soon" page (or redirect/show order UI)
    // For this task, we show the placeholder.

    // We need to handle the state where user is logged in but has no profile -> Show Name Form.
    // If user is not logged in -> Show Sign In.

    const [checkingProfile, setCheckingProfile] = useState(true);
    const [profileExists, setProfileExists] = useState(false);

    useEffect(() => {
        async function check() {
            if (user) {
                if (userProfile) {
                    setProfileExists(true);
                    setCheckingProfile(false);
                } else {
                    // Double check with firestore directly in case context is slow or mismatched? 
                    // Actually context should be enough, but context uses snapshot. 
                    // If userProfile is null but user exists, it might be loading or doesn't exist.
                    // Let's rely on useAuth loading state first.
                    const exists = await checkStudentProfileExists(user.uid);
                    setProfileExists(exists);
                    setCheckingProfile(false);
                }
            } else {
                setCheckingProfile(false);
            }
        }
        if (!loading) {
            check();
        }
    }, [user, userProfile, loading]);


    async function handleGoogleSignIn() {
        try {
            await signInWithGoogle();
            // Auth state change will trigger re-render and useEffect
        } catch (error) {
            console.error("Sign in failed", error);
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
            // After creating profile, setProfileExists(true)
            setProfileExists(true);
            // Optional: Refresh page or router push to self to ensure state update? 
            // Context should update automatically via snapshot.
        } catch (error) {
            console.error("Error creating profile:", error);
        } finally {
            setSubmitting(false);
        }
    }

    if (loading || checkingProfile) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    // State 1: Not Signed In
    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background p-4">
                <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <div className="flex justify-center mb-4">
                            <ShoppingBag className="h-12 w-12 text-primary" />
                        </div>
                        <CardTitle className="text-2xl">Sign in to Order</CardTitle>
                        <CardDescription>
                            Please sign in with your Google account to place an order.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button
                            className="w-full h-12 text-lg"
                            onClick={handleGoogleSignIn}
                        >
                            <Chrome className="mr-2 h-5 w-5" />
                            Continue with Google
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // State 2: Signed In, Missing Name
    if (!profileExists && !userProfile) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background p-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle>Almost there!</CardTitle>
                        <CardDescription>Please enter your name to complete your profile.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleNameSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Full Name</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g. Adarsh Gupta"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    minLength={2}
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={submitting}>
                                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Complete Setup
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // State 3: Fully Authenticated & Profiled -> Show Order Page (Placeholder)
    return (
        <main className="mx-auto max-w-3xl p-6">
            <h1 className="text-2xl font-semibold tracking-tight">Order Online</h1>
            <p className="mt-2 text-sm text-muted-foreground">
                Coming soon. We’ll build this page next.
            </p>

            <div className="mt-8 p-4 bg-muted rounded-md border">
                <p className="font-medium">Logged in as: {userProfile?.name || user.displayName}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
        </main>
    );
}
