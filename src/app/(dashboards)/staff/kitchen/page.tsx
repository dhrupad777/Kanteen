"use client";

import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { useOrders } from '@/contexts/order-provider';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Loader2, Search, CheckCircle2, Package, Clock, Utensils, Key, Printer, EyeOff, Bluetooth, AlertCircle } from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { checkManagerAllowlist } from '@/lib/auth';
import { KitchenViewSkeleton } from '@/components/skeletons';
import { usePrinter } from '@/hooks/use-printer';
import Link from 'next/link';

// Lazy load ReportsManager as it's heavy and not immediately needed
const ReportsManager = lazy(() => import('@/components/reports-manager').then(m => ({ default: m.ReportsManager })));

export default function KitchenDashboardPage() {
    const { orders, loading: ordersLoading } = useOrders();
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const [searchToken, setSearchToken] = useState('');
    const [verifyingOtp, setVerifyingOtp] = useState<string | null>(null);
    const [otpValue, setOtpValue] = useState('');
    const { toast } = useToast();

    const [printMethod, setPrintMethod] = useState<'bluetooth'>(() => 'bluetooth');
    const [autoPrint, setAutoPrint] = useState(() => {
        if (typeof window === 'undefined') return true;
        const saved = localStorage.getItem('kanteen_auto_print');
        return saved === null ? true : saved === 'true';
    });

    // Printer hook
    const { printer, connectBluetooth, disconnectBluetooth, generateReceiptData, sendToBluetoothPrinter } = usePrinter();

    // Track which orders we've already sent to the printer
    const printedOrderIdsRef = useRef<Set<string>>(new Set());
    const ordersInitializedRef = useRef(false);

    // Keep refs to latest values so the auto-print effect always reads
    // the live printer/autoPrint state, not a stale closure snapshot.
    const printerRef = useRef(printer);
    const autoPrintRef = useRef(autoPrint);
    const generateReceiptDataRef = useRef(generateReceiptData);
    const sendToBluetoothPrinterRef = useRef(sendToBluetoothPrinter);
    useEffect(() => { printerRef.current = printer; }, [printer]);
    useEffect(() => { autoPrintRef.current = autoPrint; }, [autoPrint]);
    useEffect(() => { generateReceiptDataRef.current = generateReceiptData; }, [generateReceiptData]);
    useEffect(() => { sendToBluetoothPrinterRef.current = sendToBluetoothPrinter; }, [sendToBluetoothPrinter]);

    // Persist auto-print setting
    useEffect(() => {
        localStorage.setItem('kanteen_auto_print', String(autoPrint));
    }, [autoPrint]);

    // =====================================================================
    // AUTO-PRINT: Watch orders directly. When a new Preparing order appears
    // and Bluetooth is connected, send it straight to the printer.
    // =====================================================================
    useEffect(() => {
        if (ordersLoading) return;

        const preparingOrders = orders.filter(o =>
            o.status === 'Preparing' &&
            o.token && o.token >= 201
        );

        if (!ordersInitializedRef.current) {
            // First load: mark all existing Preparing orders as already seen
            // so we don't reprint historical orders when the page opens
            ordersInitializedRef.current = true;
            preparingOrders.forEach(o => printedOrderIdsRef.current.add(o.id));
            return;
        }

        const newOrders = preparingOrders.filter(o => !printedOrderIdsRef.current.has(o.id));
        if (newOrders.length === 0) return;

        // Mark immediately to prevent double-printing
        newOrders.forEach(o => printedOrderIdsRef.current.add(o.id));

        // Read live values from refs — never stale
        if (!autoPrintRef.current || !printerRef.current) return;

        newOrders.forEach(async (order) => {
            const job = {
                token: order.token,
                items: order.items.map(i => ({ name: i.name, qty: i.quantity, quantity: i.quantity, price: i.price })),
                customerName: order.userName,
                isParcel: order.isParcel || false,
                note: order.note,
                totalPrice: order.totalPrice,
                platformCharges: order.platformCharges || 0,
            };
            const receiptText = generateReceiptDataRef.current(job);
            const ok = await sendToBluetoothPrinterRef.current(receiptText);
            if (ok) {
                toast({
                    title: `Printed Token ${order.token}`,
                    description: order.userName ? `Order for ${order.userName}` : 'Sent to Bluetooth printer',
                });
            }
        });
    }, [orders, ordersLoading, toast]);

    useEffect(() => {
        async function verifyManager() {
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
        ? activeOrders.filter(o =>
            o.token.toString().includes(searchToken) ||
            o.userName?.toLowerCase().includes(searchToken.toLowerCase()) ||
            o.userEmail?.toLowerCase().includes(searchToken.toLowerCase())
        )
        : activeOrders;

    const ordersByStatus = {
        Preparing: filteredOrders.filter(o => o.status === 'Preparing'),
        Ready: filteredOrders.filter(o => o.status === 'Ready'),
    };

    const [loadingOrders, setLoadingOrders] = useState<Set<string>>(new Set());

    const setOrderLoading = (orderId: string, isLoading: boolean) => {
        setLoadingOrders(prev => {
            const next = new Set(prev);
            if (isLoading) next.add(orderId);
            else next.delete(orderId);
            return next;
        });
    };

    async function handleStatusUpdate(orderId: string, newStatus: string) {
        setOrderLoading(orderId, true);
        try {
            const token = await user?.getIdToken();
            if (!token) throw new Error("Authentication required");

            const response = await fetch(`/api/staff/orders/${orderId}/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update status');
            }

            toast({ title: "Status Updated", description: `Order is now ${newStatus}` });
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message || "Failed to update order status",
                variant: "destructive",
            });
        } finally {
            setTimeout(() => setOrderLoading(orderId, false), 500);
        }
    }

    async function handleVerifyOtp(orderId: string) {
        if (!otpValue) return;
        setOrderLoading(orderId, true);
        try {
            const token = await user?.getIdToken();
            if (!token) throw new Error("Authentication required");

            const response = await fetch(`/api/staff/orders/${orderId}/verify-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ otp: otpValue })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to verify OTP');
            }

            toast({ title: "Success", description: "Order picked up successfully" });
            setVerifyingOtp(null);
            setOtpValue('');
        } catch (error: any) {
            toast({
                title: "Verification Failed",
                description: error.message || "Failed to verify OTP",
                variant: "destructive",
            });
        } finally {
            setTimeout(() => setOrderLoading(orderId, false), 500);
        }
    }

    if (authLoading || ordersLoading || isAuthorized === null) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6">
                <KitchenViewSkeleton />
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

                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search token..."
                                className="pl-9 h-10 md:h-11 bg-slate-100/50 border-transparent focus:bg-white transition-colors"
                                value={searchToken}
                                onChange={(e) => setSearchToken(e.target.value)}
                            />
                        </div>
                        <Link href="/counter" title="Daily Menu Counter">
                            <Button variant="outline" size="icon" className="h-10 w-10 md:h-11 md:w-11 shrink-0 border-primary/20 hover:bg-primary/5">
                                <EyeOff className="h-5 w-5 text-primary" />
                            </Button>
                        </Link>
                        {/* Bluetooth status indicator */}
                        <div className={cn(
                            "h-10 w-10 md:h-11 md:w-11 flex items-center justify-center rounded-md border",
                            printer
                                ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                                : "border-slate-200 bg-white text-slate-400"
                        )} title={printer ? `Connected: ${printer.name}` : 'No printer connected'}>
                            <Bluetooth className="h-5 w-5" />
                        </div>
                    </div>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-6">
                <Tabs defaultValue="Preparing" className="w-full">
                    <TabsList className="grid w-full grid-cols-4 mb-6 bg-slate-100/50 p-1 h-auto gap-1">
                        <TabsTrigger value="Preparing" className="relative py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <span className="text-[11px] sm:text-xs md:text-sm font-black">
                                <span className="sm:hidden">PREP</span>
                                <span className="hidden sm:inline">PREPARING</span>
                            </span>
                            {ordersByStatus.Preparing.length > 0 && (
                                <span className="ml-1 min-w-[1.1rem] h-4 inline-flex items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-black px-1">
                                    {ordersByStatus.Preparing.length}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="Ready" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <span className="text-[11px] sm:text-xs md:text-sm font-black uppercase">Ready</span>
                        </TabsTrigger>
                        <TabsTrigger value="Reports" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <span className="text-[11px] sm:text-xs md:text-sm font-black uppercase">
                                <span className="sm:hidden">Rep</span>
                                <span className="hidden sm:inline">Reports</span>
                            </span>
                        </TabsTrigger>
                        <TabsTrigger value="Printer" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm flex gap-1 items-center">
                            <Printer className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-[11px] sm:text-xs md:text-sm font-black uppercase hidden sm:block">Print</span>
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="Printer">
                        <div className="max-w-2xl mx-auto py-4 space-y-4">
                            <Card className="border-none shadow-sm">
                                <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                                    <h3 className="font-black text-lg">Bluetooth Auto-Print</h3>
                                    <p className="text-xs text-muted-foreground">
                                        When a new order enters the Preparing section, it prints automatically to the connected Bluetooth printer.
                                        Keep this page open on the Android device near the printer.
                                    </p>
                                </CardHeader>
                                <CardContent className="pt-4 space-y-6">

                                    {/* Auto-print toggle */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Printer className="h-5 w-5 text-primary" />
                                            <div>
                                                <p className="font-bold">Auto-Print Orders</p>
                                                <p className="text-xs text-muted-foreground">Prints token immediately when a new order arrives</p>
                                            </div>
                                        </div>
                                        <Switch checked={autoPrint} onCheckedChange={setAutoPrint} />
                                    </div>

                                    {/* Bluetooth connection */}
                                    <div className="flex items-center justify-between py-4 border-y border-slate-100 dark:border-slate-800">
                                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                                            <div className={cn("p-2 rounded-lg w-fit", printer ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500")}>
                                                <Bluetooth className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="font-bold">Bluetooth Printer</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {printer ? `Connected: ${printer.name}` : 'No printer connected — tap Connect'}
                                                </p>
                                            </div>
                                        </div>
                                        <Button
                                            onClick={printer ? disconnectBluetooth : connectBluetooth}
                                            variant={printer ? "outline" : "default"}
                                            className={cn(printer ? "text-red-500 border-red-200 hover:bg-red-50" : "bg-blue-600 hover:bg-blue-700")}
                                        >
                                            {printer ? 'Disconnect' : 'Connect Bluetooth'}
                                        </Button>
                                    </div>

                                    {/* Status summary */}
                                    <div className={cn(
                                        "p-4 rounded-xl text-sm border",
                                        printer && autoPrint
                                            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                            : "bg-amber-50 border-amber-200 text-amber-800"
                                    )}>
                                        <p className="font-bold mb-1 flex items-center gap-1.5">
                                            <AlertCircle className="w-4 h-4" />
                                            {printer && autoPrint ? 'Ready to print' : 'Not printing'}
                                        </p>
                                        <p className="text-xs">
                                            {!printer && 'Connect a Bluetooth printer above. '}
                                            {!autoPrint && 'Enable Auto-Print above. '}
                                            {printer && autoPrint && `Connected to "${printer.name}". New orders will print automatically when they appear in the Preparing tab.`}
                                        </p>
                                    </div>

                                    {/* Manual test print */}
                                    {printer && (
                                        <Button
                                            variant="outline"
                                            className="w-full font-bold"
                                            onClick={async () => {
                                                const job = {
                                                    token: 999,
                                                    items: [
                                                        { name: 'Test Chai', qty: 2, quantity: 2, price: 15 },
                                                        { name: 'Test Sandwich', qty: 1, quantity: 1, price: 40 },
                                                    ],
                                                    customerName: 'Test Customer',
                                                    isParcel: true,
                                                    note: 'Make it spicy, no oil',
                                                    totalPrice: 70,
                                                    platformCharges: 0,
                                                };
                                                const receiptText = generateReceiptData(job);
                                                const ok = await sendToBluetoothPrinter(receiptText);
                                                if (ok) toast({ title: "Test print sent!", description: "Check your printer for Token 999" });
                                            }}
                                        >
                                            <Printer className="h-4 w-4 mr-2" />
                                            Send Test Print
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="Reports">
                        <Suspense fallback={
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        }>
                            <ReportsManager />
                        </Suspense>
                    </TabsContent>

                    {(['Preparing', 'Ready'] as const).map((status) => (
                        <TabsContent key={status} value={status}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {ordersByStatus[status].map((order) => (
                                    <Card key={order.id} className={cn(
                                        "overflow-hidden border-none shadow-sm hover:shadow-md transition-all duration-300",
                                        status === 'Preparing' && "bg-white dark:bg-slate-900",
                                        status === 'Ready' && "bg-emerald-50/50 dark:bg-emerald-950/20"
                                    )}>
                                        <CardHeader className="p-4 flex flex-row items-start justify-between space-y-0">
                                            <div className="flex flex-col">
                                                <span className={cn(
                                                    "text-4xl md:text-5xl font-black tracking-tighter leading-none mb-1",
                                                    status === 'Preparing' && "text-primary",
                                                    status === 'Ready' && "text-emerald-600 dark:text-emerald-400"
                                                )}>
                                                    {order.token}
                                                </span>
                                                {order.userName && (
                                                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight truncate max-w-[160px] leading-tight">
                                                        {order.userName.split(' ')[0]}
                                                    </span>
                                                )}
                                                <span className="w-fit text-xs font-black uppercase tracking-tighter mt-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-slate-500">
                                                    {formatDistanceToNow(order.createdAt)} ago
                                                </span>
                                            </div>
                                            <div className={cn(
                                                "p-2 rounded-lg",
                                                status === 'Preparing' && "bg-blue-50 text-blue-600",
                                                status === 'Ready' && "bg-emerald-100 text-emerald-700"
                                            )}>
                                                {status === 'Preparing' && <Clock className="w-4 h-4" />}
                                                {status === 'Ready' && <Package className="w-4 h-4" />}
                                            </div>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-0 space-y-4">
                                            <div className="space-y-1.5 min-h-[4rem]">
                                                {order.items.map((item, i) => (
                                                    <div key={i} className="flex justify-between items-center text-xs">
                                                        <span className="font-bold">{item.name}</span>
                                                        <span className="font-black bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">x{item.quantity}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                                                {status === 'Preparing' && (
                                                    <Button
                                                        onClick={() => handleStatusUpdate(order.id, 'Ready')}
                                                        disabled={loadingOrders.has(order.id)}
                                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black h-12 rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-transform disabled:opacity-70 disabled:cursor-wait"
                                                    >
                                                        {loadingOrders.has(order.id) ? (
                                                            <Loader2 className="w-5 h-5 animate-spin" />
                                                        ) : (
                                                            <>
                                                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                                                MARK READY
                                                            </>
                                                        )}
                                                    </Button>
                                                )}
                                                {status === 'Ready' && (
                                                    <div className="space-y-2">
                                                        {verifyingOtp === order.id ? (
                                                            <div className="flex flex-col gap-2 p-2 bg-white dark:bg-slate-900 rounded-xl border border-emerald-200 dark:border-emerald-800">
                                                                <Input
                                                                    placeholder="ENTER OTP"
                                                                    className="font-black text-center tracking-[0.25em] sm:tracking-[0.5em] text-lg h-12 bg-slate-50 border-none"
                                                                    maxLength={4}
                                                                    inputMode="numeric"
                                                                    pattern="[0-9]*"
                                                                    value={otpValue}
                                                                    onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ''))}
                                                                    autoFocus
                                                                />
                                                                <div className="flex gap-2">
                                                                    <Button
                                                                        onClick={() => handleVerifyOtp(order.id)}
                                                                        disabled={loadingOrders.has(order.id)}
                                                                        className="flex-grow bg-emerald-600 hover:bg-emerald-700 font-black disabled:opacity-70 disabled:cursor-wait"
                                                                    >
                                                                        {loadingOrders.has(order.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : "VERIFY"}
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        onClick={() => setVerifyingOtp(null)}
                                                                        disabled={loadingOrders.has(order.id)}
                                                                        className="h-10 w-10 px-0 shrink-0"
                                                                    >
                                                                        ✕
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
