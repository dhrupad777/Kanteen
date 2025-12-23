"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { createStudentProfile, checkStudentProfileExists } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function OnboardingPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [name, setName] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            router.replace("/");
        } else if (user) {
            // If already has profile, skip onboarding
            checkStudentProfileExists(user.uid).then(exists => {
                if (exists) router.replace("/student");
            });
        }
    }, [loading, user, router]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || !name.trim()) return;

        setSubmitting(true);
        try {
            await createStudentProfile(user.uid, {
                name: name.trim(),
                email: user.email || "",
                photoURL: user.photoURL || ""
            });
            router.replace("/student");
        } catch (error) {
            console.error("Error creating profile:", error);
            setSubmitting(false);
        }
    }

    if (loading || !user) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Welcome to Kanteen!</CardTitle>
                    <CardDescription>Please enter your name to continue.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
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
                            Continue
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
