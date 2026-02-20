"use client";

import { useStaffAuth } from "@/hooks/use-staff-auth";
import { ReportsManager } from "@/components/reports-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, BarChart3, LogOut, ShieldAlert } from "lucide-react";

/**
 * /report — Owner-only business reports.
 *
 * Access requires:
 *   1. Staff login (email + password via /staff-login)
 *   2. Role must be "kitchen_manager" AND email must be dhrupadrajpurohit@gmail.com
 *
 * useStaffAuth handles the /staff-login redirect automatically.
 * isOwner is the additional email gate enforced here.
 */
export default function ReportPage() {
    const { loading, isAuthenticated, isOwner, email, signOutStaff } = useStaffAuth();

    if (loading || !isAuthenticated) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    // Authenticated as staff but not the owner account
    if (!isOwner) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
                <Card className="w-full max-w-sm border-2 border-destructive/20">
                    <CardHeader className="text-center">
                        <div className="mx-auto bg-destructive/10 p-3 rounded-full mb-2 w-fit">
                            <ShieldAlert className="h-8 w-8 text-destructive" />
                        </div>
                        <CardTitle className="text-xl font-headline">Access Denied</CardTitle>
                        <CardDescription>
                            Reports are restricted to the owner account only.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground text-center">
                            Signed in as <strong>{email}</strong>
                        </p>
                        <Button
                            variant="outline"
                            className="w-full gap-2"
                            onClick={signOutStaff}
                        >
                            <LogOut className="h-4 w-4" />
                            Sign out and try owner account
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2 rounded-xl">
                            <BarChart3 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tight">Business Reports</h1>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hidden sm:block">
                                Owner View — {email}
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={signOutStaff}
                        className="gap-2 text-muted-foreground border-slate-200 hover:text-destructive hover:border-destructive/30"
                    >
                        <LogOut className="h-4 w-4" />
                        <span className="hidden sm:inline">Sign Out</span>
                    </Button>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-6">
                <ReportsManager />
            </main>
        </div>
    );
}
