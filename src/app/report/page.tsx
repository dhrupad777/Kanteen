"use client";

import { useStaffAuth } from "@/hooks/use-staff-auth";
import { ReportsManager } from "@/components/reports-manager";
import { OrderTracker } from "@/components/order-tracker";
import { OrderCleanup } from "@/components/order-cleanup";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, BarChart3, LogOut, ShieldAlert, UtensilsCrossed, ChefHat, Trash2 } from "lucide-react";
import Link from "next/link";

/**
 * /report — Owner-only business reports.
 *
 * Access requires:
 *   1. Staff login (email + password via /staff-login)
 *   2. Role must be "kitchen_manager" AND email must be an owner email (dhrupadrajpurohit@gmail.com or manager.mrc@gmail.com)
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
                    <div className="flex items-center gap-2">
                        <Button asChild variant="outline" size="sm" className="gap-2 border-slate-200">
                            <Link href="/counter">
                                <UtensilsCrossed className="h-4 w-4" />
                                <span className="hidden sm:inline">Counter</span>
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="gap-2 border-slate-200">
                            <Link href="/kitchen">
                                <ChefHat className="h-4 w-4" />
                                <span className="hidden sm:inline">Kitchen</span>
                            </Link>
                        </Button>
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
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-6">
                <Tabs defaultValue="reports" className="w-full">
                    <TabsList className="grid w-full max-w-lg grid-cols-3 bg-slate-200/50 p-1 mb-6 rounded-xl">
                        <TabsTrigger value="reports" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">Business Reports</TabsTrigger>
                        <TabsTrigger value="tracker" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">Order Tracker</TabsTrigger>
                        <TabsTrigger value="cleanup" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-red-600 data-[state=active]:shadow-sm gap-1.5">
                            <Trash2 className="h-3.5 w-3.5" />
                            Cancel Orders
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="reports" className="m-0">
                        <ReportsManager />
                    </TabsContent>

                    <TabsContent value="tracker" className="m-0">
                        <OrderTracker />
                    </TabsContent>

                    <TabsContent value="cleanup" className="m-0">
                        <OrderCleanup />
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}
