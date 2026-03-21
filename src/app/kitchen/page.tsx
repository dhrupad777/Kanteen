"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useOrders } from '@/contexts/order-provider';
import { useAuth } from '@/hooks/use-auth';
import { useStaffAuth } from '@/hooks/use-staff-auth';
import { Loader2, Search, CheckCircle2, Package, Clock, Utensils, Key, EyeOff, LogOut, Bluetooth, Printer, AlertCircle, RotateCcw, SkipForward, History } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import { KitchenViewSkeleton } from '@/components/skeletons';
import { CouponGrid } from '@/components/coupon-grid';
import { CouponEntryForm } from '@/components/coupon-entry-form';
import { Switch } from '@/components/ui/switch';
import { usePrinter } from '@/hooks/use-printer';
import { usePrintQueueRealtime } from '@/hooks/use-print-queue-realtime';
import Link from 'next/link';

export default function KitchenPage() {
    const { orders, loading: ordersLoading } = useOrders();
    const { user } = useAuth();
    const { loading: authLoading, isAuthenticated, signOutStaff } = useStaffAuth();
    const [searchToken, setSearchToken] = useState('');
    const [verifyingOtp, setVerifyingOtp] = useState<string | null>(null);
    const [otpValue, setOtpValue] = useState('');
    const { toast } = useToast();

    // ── Bluetooth printer ────────────────────────────────────────────────────
    const { printer, connecting, connectBluetooth, disconnectBluetooth, generateReceiptData, sendToBluetoothPrinter } = usePrinter();

    const [autoPrint, setAutoPrint] = useState(() => {
        if (typeof window === 'undefined') return true;
        const saved = localStorage.getItem('kanteen_auto_print');
        return saved === null ? true : saved === 'true';
    });

    useEffect(() => {
        localStorage.setItem('kanteen_auto_print', String(autoPrint));
    }, [autoPrint]);

    // Stable refs so async callbacks always see latest values
    const printerRef = useRef(printer);
    const autoPrintRef = useRef(autoPrint);
    const generateReceiptDataRef = useRef(generateReceiptData);
    const sendToBluetoothPrinterRef = useRef(sendToBluetoothPrinter);
    useEffect(() => { printerRef.current = printer; }, [printer]);
    useEffect(() => { autoPrintRef.current = autoPrint; }, [autoPrint]);
    useEffect(() => { generateReceiptDataRef.current = generateReceiptData; }, [generateReceiptData]);
    useEffect(() => { sendToBluetoothPrinterRef.current = sendToBluetoothPrinter; }, [sendToBluetoothPrinter]);

    // ── Print Queue (source of truth) ────────────────────────────────────────
    // jobsRef gives access to current queued jobs inside async callbacks
    const jobsRef = useRef<any[]>([]);

    const processPrintJob = useCallback(async (job: any): Promise<void> => {
        if (!autoPrintRef.current || !printerRef.current) return; // printer offline — job stays queued
        const claimed = await claimJob(job.id);
        if (!claimed) return; // another tab already claimed it
        const receiptText = generateReceiptDataRef.current(job);
        const ok = await sendToBluetoothPrinterRef.current(receiptText);
        if (ok) {
            await completeJob(job.id);
            toast({ title: `Printed Token ${job.token}`, description: job.customerName ? `Order for ${job.customerName}` : 'Sent to Bluetooth printer' });
        } else {
            await failJob(job.id, 'Bluetooth send failed');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toast]);

    const { jobs, failedJobs, completedJobs, claimJob, completeJob, failJob, retryJob, recoverStaleJobs } = usePrintQueueRealtime({
        autoStart: true,
        onNewJob: processPrintJob,
    });

    useEffect(() => { jobsRef.current = jobs; }, [jobs]);

    // When printer connects (auto-reconnect or manual): flush pending queue
    const processPendingQueue = useCallback(async () => {
        await recoverStaleJobs(); // unstick any stuck in 'printing'
        for (const job of jobsRef.current) {
            await processPrintJob(job);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [processPrintJob, recoverStaleJobs]);

    const prevPrinterRef = useRef<typeof printer>(null);
    useEffect(() => {
        if (printer && !prevPrinterRef.current) {
            // Printer just became connected — process any pending queue
            processPendingQueue();
        }
        prevPrinterRef.current = printer;
    }, [printer, processPendingQueue]);

    // ── Online orders only (Razorpay-paid, token 201–999) ───────────────────
    const onlineOrders = orders.filter(o =>
        ['Preparing', 'Ready'].includes(o.status) &&
        o.token && o.token >= 201
    );

    const filteredOnline = searchToken
        ? onlineOrders.filter(o =>
            o.token?.toString().includes(searchToken) ||
            o.userName?.toLowerCase().includes(searchToken.toLowerCase()) ||
            o.userEmail?.toLowerCase().includes(searchToken.toLowerCase())
        )
        : onlineOrders;

    const onlineByStatus = {
        Preparing: filteredOnline.filter(o => o.status === 'Preparing'),
        Ready: filteredOnline.filter(o => o.status === 'Ready'),
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
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: newStatus })
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update status');
            }
            toast({ title: "Status Updated", description: `Order is now ${newStatus}` });
        } catch (error: any) {
            toast({ title: "Error", description: error.message || "Failed to update order status", variant: "destructive" });
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
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ otp: otpValue })
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to verify OTP');
            }
            toast({ title: "Order Collected ✓", description: "Order picked up successfully", variant: "success" });
            setVerifyingOtp(null);
            setOtpValue('');
        } catch (error: any) {
            toast({ title: "Wrong OTP", description: error.message || "Failed to verify OTP", variant: "destructive" });
        } finally {
            setTimeout(() => setOrderLoading(orderId, false), 500);
        }
    }

    if (authLoading || ordersLoading || !isAuthenticated) {
        return (
            <div className="min-h-screen bg-slate-50 p-4 md:p-6">
                <KitchenViewSkeleton />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-20 md:pb-6">
            {/* ── Sticky Header ─────────────────────────────────────────── */}
            <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3 md:px-6 md:py-4">
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
                                placeholder="Search online token..."
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
                        <div
                            className={cn(
                                "h-10 w-10 md:h-11 md:w-11 flex items-center justify-center rounded-md border",
                                printer
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                                    : "border-slate-200 bg-white text-slate-400"
                            )}
                            title={printer ? `Connected: ${printer.name}` : 'No printer connected'}
                        >
                            <Bluetooth className="h-5 w-5" />
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={signOutStaff}
                            title="Sign out"
                            className="h-10 w-10 md:h-11 md:w-11 shrink-0 border-slate-200 hover:text-destructive hover:border-destructive/30"
                        >
                            <LogOut className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-6">
                <Tabs defaultValue="Preparing" className="w-full">
                    <TabsList className="grid w-full grid-cols-4 mb-6 bg-slate-100/50 p-1 h-auto gap-1">
                        {/* Online: Preparing */}
                        <TabsTrigger value="Preparing" className="relative py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <span className="text-[11px] sm:text-xs md:text-sm font-black">
                                <span className="sm:hidden">PREP</span>
                                <span className="hidden sm:inline">PREPARING</span>
                            </span>
                            {onlineByStatus.Preparing.length > 0 && (
                                <Badge className="ml-1 px-1.5 py-0 min-w-[1.25rem] h-5 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-[10px] font-black border-none ring-2 ring-white shadow-sm">
                                    {onlineByStatus.Preparing.length}
                                </Badge>
                            )}
                        </TabsTrigger>

                        {/* Online: Ready */}
                        <TabsTrigger value="Ready" className="py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <span className="text-[11px] sm:text-xs md:text-sm font-black uppercase">Ready</span>
                            {onlineByStatus.Ready.length > 0 && (
                                <Badge className="ml-1 px-1.5 py-0 min-w-[1.25rem] h-5 flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-[10px] font-black border-none ring-2 ring-white shadow-sm">
                                    {onlineByStatus.Ready.length}
                                </Badge>
                            )}
                        </TabsTrigger>

                        {/* Walk-in / Coupon grid */}
                        <TabsTrigger value="Walkin" className="py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <span className="text-[11px] sm:text-xs md:text-sm font-black uppercase">Walk-in</span>
                        </TabsTrigger>

                        {/* Printer */}
                        <TabsTrigger value="Printer" className="relative py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm flex gap-1 items-center">
                            <Printer className={cn("w-3.5 h-3.5", printer ? "text-emerald-500" : "text-muted-foreground")} />
                            <span className="text-[11px] sm:text-xs md:text-sm font-black uppercase hidden sm:block">Print</span>
                            {(jobs.length > 0 || failedJobs.length > 0) && (
                                <Badge className="ml-1 px-1.5 py-0 min-w-[1.25rem] h-5 flex items-center justify-center bg-amber-500 hover:bg-amber-600 text-[10px] font-black border-none ring-2 ring-white shadow-sm">
                                    {jobs.length + failedJobs.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    {/* ── Online: Preparing ────────────────────────────────── */}
                    <TabsContent value="Preparing">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {onlineByStatus.Preparing.map(order => (
                                <OrderCard
                                    key={order.id}
                                    order={order}
                                    status="Preparing"
                                    loadingOrders={loadingOrders}
                                    verifyingOtp={verifyingOtp}
                                    otpValue={otpValue}
                                    onStatusUpdate={handleStatusUpdate}
                                    onVerifyOtp={handleVerifyOtp}
                                    onStartVerify={() => setVerifyingOtp(order.id)}
                                    onCancelVerify={() => setVerifyingOtp(null)}
                                    onOtpChange={setOtpValue}
                                />
                            ))}
                        </div>
                        {onlineByStatus.Preparing.length === 0 && <EmptyState label="No online orders being prepared" />}
                    </TabsContent>

                    {/* ── Online: Ready ─────────────────────────────────────── */}
                    <TabsContent value="Ready">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {onlineByStatus.Ready.map(order => (
                                <OrderCard
                                    key={order.id}
                                    order={order}
                                    status="Ready"
                                    loadingOrders={loadingOrders}
                                    verifyingOtp={verifyingOtp}
                                    otpValue={otpValue}
                                    onStatusUpdate={handleStatusUpdate}
                                    onVerifyOtp={handleVerifyOtp}
                                    onStartVerify={() => setVerifyingOtp(order.id)}
                                    onCancelVerify={() => setVerifyingOtp(null)}
                                    onOtpChange={setOtpValue}
                                />
                            ))}
                        </div>
                        {onlineByStatus.Ready.length === 0 && <EmptyState label="No online orders ready" />}
                    </TabsContent>

                    {/* ── Walk-in / Offline Coupon Grid ─────────────────────── */}
                    <TabsContent value="Walkin">
                        <div className="space-y-6">
                            <CouponEntryForm />
                            <CouponGrid orders={orders} />
                        </div>
                    </TabsContent>

                    {/* ── Bluetooth Printer ─────────────────────────────────── */}
                    <TabsContent value="Printer">
                        <div className="max-w-2xl mx-auto py-4 space-y-4">

                            {/* Connection & Settings card */}
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                                <div className="p-5 border-b border-slate-100">
                                    <h3 className="font-black text-lg">Bluetooth Printer</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        New orders print automatically when payment is confirmed. On page reload, any missed receipts print as soon as the printer reconnects.
                                    </p>
                                </div>
                                <div className="p-5 space-y-5">
                                    {/* Auto-print toggle */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Printer className="h-5 w-5 text-primary" />
                                            <div>
                                                <p className="font-bold text-sm">Auto-Print Orders</p>
                                                <p className="text-xs text-muted-foreground">Prints receipt immediately when a new order arrives</p>
                                            </div>
                                        </div>
                                        <Switch checked={autoPrint} onCheckedChange={setAutoPrint} />
                                    </div>

                                    {/* Bluetooth connection */}
                                    <div className="flex items-center justify-between py-4 border-y border-slate-100">
                                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                                            <div className={cn("p-2 rounded-lg w-fit", printer ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500")}>
                                                <Bluetooth className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm">Bluetooth Printer</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {printer ? `Connected: ${printer.name}` : 'No printer connected — tap Connect'}
                                                </p>
                                            </div>
                                        </div>
                                        <Button
                                            onClick={printer ? disconnectBluetooth : connectBluetooth}
                                            disabled={connecting}
                                            variant={printer ? "outline" : "default"}
                                            className={cn(printer ? "text-red-500 border-red-200 hover:bg-red-50" : "bg-blue-600 hover:bg-blue-700")}
                                        >
                                            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : printer ? 'Disconnect' : 'Connect Bluetooth'}
                                        </Button>
                                    </div>

                                    {/* Status */}
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
                                            {printer && autoPrint && `Connected to "${printer.name}". Receipts print automatically.`}
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
                                </div>
                            </div>

                            {/* Pending / Failed jobs */}
                            {(jobs.length > 0 || failedJobs.length > 0) && (
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                                    <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                                        <div>
                                            <h3 className="font-black text-lg">Print Queue</h3>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {jobs.length} pending · {failedJobs.length} failed
                                            </p>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={async () => {
                                                const n = await recoverStaleJobs();
                                                toast({ title: `Recovered ${n} stuck job${n !== 1 ? 's' : ''}` });
                                                if (printer) processPendingQueue();
                                            }}
                                            className="text-xs"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                                            Recover stuck
                                        </Button>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                        {[...jobs, ...failedJobs].map(job => (
                                            <div key={job.id} className="flex items-center justify-between px-5 py-3 gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-black text-primary text-base">#{job.token}</span>
                                                        {job.customerName && (
                                                            <span className="text-xs text-muted-foreground truncate">{job.customerName.split(' ')[0]}</span>
                                                        )}
                                                        <Badge
                                                            variant="secondary"
                                                            className={cn(
                                                                "text-[10px] font-black uppercase shrink-0",
                                                                job.status === 'failed' || job.status === 'dead_letter'
                                                                    ? "bg-red-100 text-red-700"
                                                                    : "bg-amber-100 text-amber-700"
                                                            )}
                                                        >
                                                            {job.status === 'dead_letter' ? 'dead' : job.status}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        {job.items.length} item{job.items.length !== 1 ? 's' : ''} · {formatDistanceToNow(job.createdAt)} ago
                                                    </p>
                                                    {job.error && <p className="text-[10px] text-red-500 mt-0.5 truncate">{job.error}</p>}
                                                </div>
                                                <div className="flex gap-2 shrink-0">
                                                    {(job.status === 'failed' || job.status === 'dead_letter') && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 text-xs font-bold"
                                                            onClick={async () => {
                                                                await retryJob(job.id);
                                                                if (printer) setTimeout(() => processPendingQueue(), 300);
                                                            }}
                                                        >
                                                            <RotateCcw className="w-3 h-3 mr-1" />
                                                            Retry
                                                        </Button>
                                                    )}
                                                    {/* Don't print — skip this job without wasting paper */}
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                                                        title="Skip — mark as done without printing"
                                                        onClick={async () => {
                                                            await completeJob(job.id);
                                                            toast({ title: `Token ${job.token} skipped`, description: 'Marked as done without printing' });
                                                        }}
                                                    >
                                                        <SkipForward className="w-3.5 h-3.5 mr-1" />
                                                        Skip
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Recent Receipts */}
                            {completedJobs.length > 0 && (
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                                    <div className="p-5 border-b border-slate-100 flex items-center gap-2">
                                        <History className="w-4 h-4 text-muted-foreground" />
                                        <h3 className="font-black text-base">Recent Receipts</h3>
                                        <span className="text-xs text-muted-foreground ml-auto">last {completedJobs.length}</span>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                        {completedJobs.map(job => {
                                            const printedAt = (job as any).completedAt instanceof Date
                                                ? (job as any).completedAt
                                                : job.createdAt;
                                            // Avg lifecycle: completedAt - createdAt (in minutes)
                                            const diffMs = printedAt.getTime() - job.createdAt.getTime();
                                            const diffMin = Math.round(diffMs / 60000);
                                            return (
                                                <div key={job.id} className="flex items-center justify-between px-5 py-3 gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-black text-primary text-base">#{job.token}</span>
                                                            {job.customerName && (
                                                                <span className="text-xs text-muted-foreground truncate">{job.customerName.split(' ')[0]}</span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mt-0.5">
                                                            {format(printedAt, 'h:mm a')} · {diffMin > 0 ? `${diffMin}m lifecycle` : 'just printed'}
                                                        </p>
                                                    </div>
                                                    <Badge variant="secondary" className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-700 shrink-0">
                                                        done
                                                    </Badge>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}

function EmptyState({ label }: { label: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-32 text-muted-foreground bg-white/40 rounded-3xl border-2 border-dashed border-slate-200">
            <div className="bg-slate-100 p-4 rounded-full mb-4">
                <Package className="h-8 w-8 opacity-20" />
            </div>
            <p className="font-black text-xs uppercase tracking-widest opacity-50">{label}</p>
        </div>
    );
}

function OrderCard({
    order, status, loadingOrders, verifyingOtp, otpValue,
    onStatusUpdate, onVerifyOtp, onStartVerify, onCancelVerify, onOtpChange,
}: {
    order: any;
    status: 'Preparing' | 'Ready';
    loadingOrders: Set<string>;
    verifyingOtp: string | null;
    otpValue: string;
    onStatusUpdate: (id: string, status: string) => void;
    onVerifyOtp: (id: string) => void;
    onStartVerify: () => void;
    onCancelVerify: () => void;
    onOtpChange: (val: string) => void;
}) {
    return (
        <Card className={cn(
            "overflow-hidden border-none shadow-sm hover:shadow-md transition-all duration-300",
            status === 'Preparing' && "bg-white",
            status === 'Ready' && "bg-emerald-50/50"
        )}>
            <CardHeader className="p-4 flex flex-row items-start justify-between space-y-0">
                <div className="flex flex-col">
                    <span className={cn(
                        "text-4xl md:text-5xl font-black tracking-tighter leading-none mb-1",
                        status === 'Preparing' && "text-primary",
                        status === 'Ready' && "text-emerald-600"
                    )}>
                        {order.token ?? '—'}
                    </span>
                    {order.userName && (
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight truncate max-w-[120px] leading-tight">
                            {order.userName.split(' ')[0]}
                        </span>
                    )}
                    <Badge variant="secondary" className="w-fit text-[10px] font-black uppercase tracking-tighter mt-1">
                        {formatDistanceToNow(order.createdAt)} ago
                    </Badge>
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
                    {order.items.map((item: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-xs">
                            <span className="font-bold">{item.name}</span>
                            <span className="font-black bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">x{item.quantity}</span>
                        </div>
                    ))}
                </div>
                <div className="pt-2 border-t border-slate-100">
                    {status === 'Preparing' && (
                        <Button
                            onClick={() => onStatusUpdate(order.id, 'Ready')}
                            disabled={loadingOrders.has(order.id)}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black h-12 rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-transform disabled:opacity-70 disabled:cursor-wait"
                        >
                            {loadingOrders.has(order.id)
                                ? <Loader2 className="w-5 h-5 animate-spin" />
                                : <><CheckCircle2 className="w-4 h-4 mr-2" />MARK READY</>
                            }
                        </Button>
                    )}
                    {status === 'Ready' && (
                        <div className="space-y-2">
                            {verifyingOtp === order.id ? (
                                <div className="flex flex-col gap-2 p-2 bg-white rounded-xl border border-emerald-200">
                                    <Input
                                        placeholder="ENTER OTP"
                                        className="font-black text-center tracking-[0.5em] text-lg h-12 bg-slate-50 border-none"
                                        maxLength={4}
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={otpValue}
                                        onChange={(e) => onOtpChange(e.target.value.replace(/\D/g, ''))}
                                        autoFocus
                                    />
                                    <div className="flex gap-2">
                                        <Button
                                            onClick={() => onVerifyOtp(order.id)}
                                            disabled={loadingOrders.has(order.id)}
                                            className="flex-grow bg-emerald-600 hover:bg-emerald-700 font-black disabled:opacity-70 disabled:cursor-wait"
                                        >
                                            {loadingOrders.has(order.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : "VERIFY"}
                                        </Button>
                                        <Button variant="ghost" onClick={onCancelVerify} disabled={loadingOrders.has(order.id)} className="px-3">X</Button>
                                    </div>
                                </div>
                            ) : (
                                <Button
                                    onClick={onStartVerify}
                                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black h-12 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-transform"
                                >
                                    <Key className="w-4 h-4 mr-2" />FINISH PICKUP
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
