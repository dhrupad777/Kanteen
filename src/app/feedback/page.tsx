"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { signInWithGoogle, isInAppBrowser } from "@/lib/auth";
import { FeedbackForm } from "@/components/feedback-form";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

/**
 * Poster / QR landing: Google sign-in if needed, then the feedback form.
 * GET /feedback
 */
export default function FeedbackPage() {
    const { user, loading, processingRedirect } = useAuth();
    const { toast } = useToast();
    const [signingIn, setSigningIn] = useState(false);
    const inAppBrowser = typeof window !== "undefined" && isInAppBrowser();

    async function handleGoogleSignIn() {
        setSigningIn(true);
        try {
            await signInWithGoogle();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Could not sign in with Google. Please try again.";
            toast({
                title: "Sign-in failed",
                description: message,
                variant: "destructive",
            });
        } finally {
            setSigningIn(false);
        }
    }

    if (loading || processingRedirect) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
        );
    }

    if (!user) {
        if (inAppBrowser) {
            return (
                <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
                    <div className="w-full max-w-sm text-center">
                        <div className="w-20 h-20 mx-auto mb-8 rounded-[22px] bg-primary flex items-center justify-center shadow-lg shadow-orange-200">
                            <MessageSquare className="h-10 w-10 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">Open in your browser</h1>
                        <p className="text-gray-500 mb-6">
                            Google sign-in doesn&apos;t work inside apps like Instagram or Facebook.
                        </p>
                        <p className="text-gray-400 text-sm mb-8">
                            Tap the <span className="font-semibold text-gray-600">&#8942;</span> menu (or share icon) and choose <span className="font-semibold text-gray-600">&ldquo;Open in Chrome&rdquo;</span> or <span className="font-semibold text-gray-600">&ldquo;Open in Safari&rdquo;</span>.
                        </p>
                        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 text-sm text-orange-800 font-mono break-all select-all">
                            kanteen-mrc-live.web.app/feedback
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
                <div className="w-full max-w-sm text-center">
                    <div className="w-20 h-20 mx-auto mb-8 rounded-[22px] bg-primary flex items-center justify-center shadow-lg shadow-orange-200">
                        <MessageSquare className="h-10 w-10 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">
                        Send feedback
                    </h1>
                    <p className="text-gray-500 mb-8">
                        Sign in with Google to tell us how we&apos;re doing. New here? This also creates your Kanteen account.
                    </p>
                    <button
                        onClick={handleGoogleSignIn}
                        disabled={signingIn}
                        className={cn(
                            "w-full h-14 flex items-center justify-center gap-3",
                            "bg-white border border-gray-200 rounded-2xl shadow-sm",
                            "text-gray-700 text-base font-semibold",
                            "hover:bg-gray-50 hover:shadow-md active:scale-[0.98]",
                            "transition-all duration-200 disabled:opacity-60",
                        )}
                    >
                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        Continue with Google
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="mx-auto w-full max-w-md pt-8">
                <div className="w-16 h-16 mx-auto mb-6 rounded-[18px] bg-primary flex items-center justify-center shadow-lg shadow-orange-200">
                    <MessageSquare className="h-8 w-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight text-center mb-1">
                    Send us feedback
                </h1>
                <p className="text-sm text-gray-500 text-center mb-8">
                    Tell us how we&apos;re doing — anything at all.
                </p>
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <FeedbackForm />
                </div>
                <p className="text-center mt-6">
                    <Link href="/student" className="text-sm text-gray-400 hover:text-primary">
                        Go to Kanteen
                    </Link>
                </p>
            </div>
        </div>
    );
}
