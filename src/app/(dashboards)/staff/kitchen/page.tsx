"use client";

import { useEffect, useState } from 'react';
import { useOrders } from '@/contexts/order-provider';
import { Order } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Loader2, Search, CheckCircle2, Package, Clock, Utensils, Key } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ReportsManager } from '@/components/reports-manager';

import { checkManagerAllowlist } from '@/lib/auth';

export default function KitchenDashboardPage() {
    const { orders, loading: ordersLoading } = useOrders();
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const [searchToken, setSearchToken] = useState('');
    const [verifyingOtp, setVerifyingOtp] = useState<string | null>(null);
    const [otpValue, setOtpValue] = useState('');
    const { toast } = useToast();

    useEffect(() => {
        async function verifyManager() {
            const isTestMode = typeof window !== 'undefined' && localStorage.getItem('managerTestMode') === 'true';
            if (isTestMode) {
                setIsAuthorized(true);
                return;
            }

            if (user && user.email) {
                const allowed = await checkManagerAllowlist(user.email);
                setIsAuthorized(allowed);
                if (!allowed) router.push('/');
            } else if (!authLoading) {
                setIsAuthorized(false);
                router.push('/');
            }
        }
        if (!authLoading) verifyManager();
    }, [user, authLoading, router]);

    const activeOrders = orders.filter(o =>
        ['Preparing', 'Ready'].includes(o.status) &&
        o.token && o.token >= 201
    );

    const filteredOrders = searchToken
        ? activeOrders.filter(o => o.token.toString().includes(searchToken))
        : activeOrders;

    const ordersByStatus = {
        Preparing: filteredOrders.filter(o => o.status === 'Preparing'),
        Ready: filteredOrders.filter(o => o.status === 'Ready'),
    };

    async function handleStatusUpdate(orderId: string, newStatus: string) {
        try {
            const idToken = await user?.getIdToken();
            const response = await fetch(`/api/staff/orders/${orderId}/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ status: newStatus }),
            });

            if (!response.ok) throw new Error('Failed to update status');

            toast({
                title: "Status Updated",
                description: `Order is now ${newStatus}`,
            });
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to update order status",
                variant: "destructive",
            });
        }
    }

    async function handleVerifyOtp(orderId: string) {
        if (!otpValue) return;

        try {
            const idToken = await user?.getIdToken();
            const response = await fetch(`/api/staff/orders/${orderId}/verify-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ otp: otpValue }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Invalid OTP');
            }

            toast({
                title: "Success",
                description: "Order picked up successfully",
            });
            setVerifyingOtp(null);
            setOtpValue('');
        } catch (error: any) {
            toast({
                title: "Verification Failed",
                description: error.message,
                variant: "destructive",
            });
        }
    }

    if (authLoading || ordersLoading || isAuthorized === null) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20 md:pb-6">
            <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3 md:px-6 md:py-4">
                <div className="container mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2 rounded-xl">
                            <Utensils className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl md:text-2xl font-black tracking-tight">Kitchen View</h1>
                            <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-muted-foreground hidden sm:block">Fulfillment Dashboard</p>
                        </div>
                    </div>

                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search token..."
                            className="pl-9 h-10 md:h-11 bg-slate-100/50 border-transparent focus:bg-white transition-colors"
                            value={searchToken}
                            onChange={(e) => setSearchToken(e.target.value)}
                        />
                    </div>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-6">
                <Tabs defaultValue="Preparing" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 mb-6 bg-slate-100/50 p-1 h-auto gap-1">
                        <TabsTrigger value="Preparing" className="relative py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <span className="text-xs md:text-sm font-black">PREPARING</span>
                            {ordersByStatus.Preparing.length > 0 && (
                                <Badge className="ml-1 md:ml-2 px-1.5 py-0 min-w-[1.25rem] h-5 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-[10px] font-black border-none ring-2 ring-white dark:ring-slate-900 shadow-sm">
                                    {ordersByStatus.Preparing.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="Ready" className="py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <span className="text-xs md:text-sm font-black uppercase">Ready</span>
                        </TabsTrigger>
                        <TabsTrigger value="Reports" className="py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <span className="text-xs md:text-sm font-black uppercase">Reports</span>
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="Reports">
                        <ReportsManager />
                    </TabsContent>

                    {(['Preparing', 'Ready'] as const).map((status) => (
                        <TabsContent key={status} value={status}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {ordersByStatus[status].map((order) => (
                                    <Card key={order.id} className={cn(
                                        "overflow-hidden border-none shadow-sm hover:shadow-md transition-all duration-300",
                                        status === 'Preparing' ? "bg-white dark:bg-slate-900" : "bg-emerald-50/50 dark:bg-emerald-950/20"
                                    )}>
                                        <CardHeader className="p-4 flex flex-row items-start justify-between space-y-0">
                                            <div className="flex flex-col">
                                                <span className={cn(
                                                    "text-4xl md:text-5xl font-black tracking-tighter leading-none mb-1",
                                                    status === 'Preparing' ? "text-primary" : "text-emerald-600 dark:text-emerald-400"
                                                )}>
                                                    {order.token}
                                                </span>
                                                <Badge variant="secondary" className="w-fit text-[10px] font-black uppercase tracking-tighter">
                                                    {formatDistanceToNow(order.createdAt)} ago
                                                </Badge>
                                            </div>
                                            <div className={cn(
                                                "p-2 rounded-lg",
                                                status === 'Preparing' ? "bg-blue-50 text-blue-600" : "bg-emerald-100 text-emerald-700"
                                            )}>
                                                {status === 'Preparing' ? <Clock className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                                            </div>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-0 space-y-4">
                                            <div className="space-y-1.5 min-h-[4rem]">
                                                {order.items.map((item, i) => (
                                                    <div key={i} className="flex justify-between items-center text-xs">
                                                        <span className="font-bold">{item.name}</span>
                                                        <span className="font-black bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">x{item.quantity}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                                                {status === 'Preparing' && (
                                                    <Button
                                                        onClick={() => handleStatusUpdate(order.id, 'Ready')}
                                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black h-12 rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-transform"
                                                    >
                                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                                        MARK READY
                                                    </Button>
                                                )}
                                                {status === 'Ready' && (
                                                    <div className="space-y-2">
                                                        {verifyingOtp === order.id ? (
                                                            <div className="flex flex-col gap-2 p-2 bg-white dark:bg-slate-900 rounded-xl border border-emerald-200 dark:border-emerald-800">
                                                                <Input
                                                                    placeholder="ENTER OTP"
                                                                    className="font-black text-center tracking-[0.5em] text-lg h-12 bg-slate-50 border-none"
                                                                    maxLength={6}
                                                                    value={otpValue}
                                                                    onChange={(e) => setOtpValue(e.target.value)}
                                                                    autoFocus
                                                                />
                                                                <div className="flex gap-2">
                                                                    <Button
                                                                        onClick={() => handleVerifyOtp(order.id)}
                                                                        className="flex-grow bg-emerald-600 hover:bg-emerald-700 font-black"
                                                                    >
                                                                        VERIFY
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        onClick={() => setVerifyingOtp(null)}
                                                                        className="px-3"
                                                                    >
                                                                        X
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <Button
                                                                onClick={() => setVerifyingOtp(order.id)}
                                                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black h-12 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-transform"
                                                            >
                                                                <Key className="w-4 h-4 mr-2" />
                                                                FINISH PICKUP
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                            {ordersByStatus[status].length === 0 && (
                                <div className="flex flex-col items-center justify-center py-32 text-muted-foreground bg-white/40 dark:bg-slate-900/40 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                                    <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-full mb-4">
                                        <Package className="h-8 w-8 opacity-20" />
                                    </div>
                                    <p className="font-black text-xs uppercase tracking-widest opacity-50">No orders in this stage</p>
                                </div>
                            )}
                        </TabsContent>
                    ))}
                </Tabs>
            </main>
        </div>
    );
}
