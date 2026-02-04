"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { usePrintQueueRealtime } from '@/hooks/use-print-queue-realtime';
import {
    Printer,
    Bluetooth,
    BluetoothOff,
    Volume2,
    VolumeX,
    AlertCircle,
    Loader2,
    Package,
    ArrowLeft
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { checkManagerAllowlist } from '@/lib/auth';
import Link from 'next/link';

// ESC/POS Commands for thermal printers
const ESC = '\x1B';
const GS = '\x1D';
const ESCPOS = {
    INIT: ESC + '@',
    ALIGN_CENTER: ESC + 'a' + '\x01',
    ALIGN_LEFT: ESC + 'a' + '\x00',
    BOLD_ON: ESC + 'E' + '\x01',
    BOLD_OFF: ESC + 'E' + '\x00',
    DOUBLE_HEIGHT: GS + '!' + '\x10',
    DOUBLE_WIDTH: GS + '!' + '\x20',
    DOUBLE_SIZE: GS + '!' + '\x30',
    NORMAL_SIZE: GS + '!' + '\x00',
    CUT: GS + 'V' + '\x00',
    PARTIAL_CUT: GS + 'V' + '\x01',
    FEED: ESC + 'd' + '\x03',
};

interface BluetoothPrinter {
    device: BluetoothDevice;
    characteristic: BluetoothRemoteGATTCharacteristic | null;
    name: string;
}

// Generate printer ID for this device
function getPrinterId(): string {
    if (typeof window === 'undefined') return 'unknown';
    let id = localStorage.getItem('kanteen_printer_id');
    if (!id) {
        id = 'printer_' + Math.random().toString(36).substring(2, 10);
        localStorage.setItem('kanteen_printer_id', id);
    }
    return id;
}

export default function KitchenPrintPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

    // Printer state
    const [printer, setPrinter] = useState<BluetoothPrinter | null>(null);
    const [connecting, setConnecting] = useState(false);

    // Settings
    const [autoPrint, setAutoPrint] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);

    // Audio ref for notification sound
    const audioRef = useRef<AudioContext | null>(null);

    // Print service hook - Real-time Firestore listener (instant updates)
    const printerId = getPrinterId();
    const {
        jobs,
        loading,
        error,
        isListening,
        startListening,
        stopListening,
        claimJob,
        completeJob,
        failJob,
    } = usePrintQueueRealtime({
        autoStart: false,
        printerId,
        onNewJob: (job) => {
            // Play sound
            if (soundEnabled) {
                playNotificationSound();
            }
            // Auto-print if enabled and printer connected
            if (autoPrint && printer?.characteristic) {
                handlePrintJob(job.id);
            }
        }
    });

    // Authorization check
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

    // Play notification sound
    const playNotificationSound = useCallback(() => {
        try {
            if (!audioRef.current) {
                audioRef.current = new AudioContext();
            }
            const ctx = audioRef.current;
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();

            oscillator.connect(gain);
            gain.connect(ctx.destination);

            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gain.gain.value = 0.3;

            oscillator.start();
            oscillator.stop(ctx.currentTime + 0.2);

            // Second beep
            setTimeout(() => {
                const osc2 = ctx.createOscillator();
                const gain2 = ctx.createGain();
                osc2.connect(gain2);
                gain2.connect(ctx.destination);
                osc2.frequency.value = 1000;
                osc2.type = 'sine';
                gain2.gain.value = 0.3;
                osc2.start();
                osc2.stop(ctx.currentTime + 0.2);
            }, 250);
        } catch (e) {
            console.error('Failed to play sound:', e);
        }
    }, []);

    // Connect to Bluetooth printer
    const connectPrinter = async () => {
        if (!navigator.bluetooth) {
            toast({
                title: "Bluetooth Not Supported",
                description: "Your browser doesn't support Web Bluetooth. Use Chrome on Android.",
                variant: "destructive"
            });
            return;
        }

        setConnecting(true);
        try {
            // Request Bluetooth device with Serial Port Profile
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: ['000018f0-0000-1000-8000-00805f9b34fb'] }, // Common thermal printer service
                    { namePrefix: 'Printer' },
                    { namePrefix: 'POS' },
                    { namePrefix: 'XP' },
                    { namePrefix: 'TM' },
                ],
                optionalServices: [
                    '000018f0-0000-1000-8000-00805f9b34fb',
                    '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Nordic UART
                    'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Serial Port
                ]
            });

            toast({
                title: "Connecting...",
                description: `Connecting to ${device.name || 'printer'}`,
            });

            const server = await device.gatt?.connect();
            if (!server) throw new Error('Failed to connect to GATT server');

            // Try to find the write characteristic
            let characteristic: BluetoothRemoteGATTCharacteristic | null = null;
            const services = await server.getPrimaryServices();

            for (const service of services) {
                try {
                    const chars = await service.getCharacteristics();
                    for (const char of chars) {
                        if (char.properties.write || char.properties.writeWithoutResponse) {
                            characteristic = char;
                            break;
                        }
                    }
                    if (characteristic) break;
                } catch (e) {
                    console.log('Service exploration failed:', e);
                }
            }

            if (!characteristic) {
                throw new Error('No writable characteristic found');
            }

            setPrinter({
                device,
                characteristic,
                name: device.name || 'Unknown Printer'
            });

            // Handle disconnection
            device.addEventListener('gattserverdisconnected', () => {
                setPrinter(null);
                toast({
                    title: "Printer Disconnected",
                    description: "Bluetooth connection lost",
                    variant: "destructive"
                });
            });

            toast({
                title: "Connected!",
                description: `Connected to ${device.name || 'printer'}`,
            });

        } catch (error: any) {
            console.error('Bluetooth connection error:', error);
            toast({
                title: "Connection Failed",
                description: error.message || "Could not connect to printer",
                variant: "destructive"
            });
        } finally {
            setConnecting(false);
        }
    };

    // Disconnect printer
    const disconnectPrinter = () => {
        if (printer?.device.gatt?.connected) {
            printer.device.gatt.disconnect();
        }
        setPrinter(null);
    };

    // Generate receipt text for thermal printer
    const generateReceiptData = (job: any): string => {
        const width = 32;
        const center = (text: string) => {
            const padding = Math.max(0, Math.floor((width - text.length) / 2));
            return ' '.repeat(padding) + text;
        };
        const line = (char: string = '-') => char.repeat(width);

        let receipt = '';

        // Initialize printer
        receipt += ESCPOS.INIT;

        // Header
        receipt += ESCPOS.ALIGN_CENTER;
        receipt += ESCPOS.BOLD_ON;
        receipt += ESCPOS.DOUBLE_SIZE;
        receipt += 'KANTEEN\n';
        receipt += ESCPOS.NORMAL_SIZE;
        receipt += ESCPOS.BOLD_OFF;
        receipt += 'Kitchen Order\n';
        receipt += line('=') + '\n';

        // Token - BIG and BOLD
        receipt += '\n';
        receipt += ESCPOS.BOLD_ON;
        receipt += ESCPOS.DOUBLE_SIZE;
        receipt += `TOKEN: ${job.token}\n`;
        receipt += ESCPOS.NORMAL_SIZE;
        receipt += ESCPOS.BOLD_OFF;
        receipt += '\n';

        // Customer info
        receipt += ESCPOS.ALIGN_LEFT;
        if (job.customerName) {
            receipt += `Name: ${job.customerName}\n`;
        }
        if (job.customerEmail) {
            // Show email in smaller text
            const emailShort = job.customerEmail.length > 28
                ? job.customerEmail.substring(0, 25) + '...'
                : job.customerEmail;
            receipt += `${emailShort.toLowerCase()}\n`;
        }

        // Parcel indicator
        if (job.isParcel) {
            receipt += ESCPOS.ALIGN_CENTER;
            receipt += ESCPOS.BOLD_ON;
            receipt += '*** PARCEL ***\n';
            receipt += ESCPOS.BOLD_OFF;
        }

        receipt += line('-') + '\n';

        // Kitchen Note (if any) - IMPORTANT for kitchen staff
        if (job.note) {
            receipt += ESCPOS.BOLD_ON;
            receipt += 'NOTE:\n';
            receipt += ESCPOS.BOLD_OFF;
            // Word wrap note to fit 32 char width
            const words = job.note.split(' ');
            let currentLine = '';
            words.forEach((word: string) => {
                if ((currentLine + ' ' + word).trim().length <= 30) {
                    currentLine = (currentLine + ' ' + word).trim();
                } else {
                    if (currentLine) receipt += currentLine + '\n';
                    currentLine = word;
                }
            });
            if (currentLine) receipt += currentLine + '\n';
            receipt += line('-') + '\n';
        }

        // Items
        receipt += ESCPOS.ALIGN_LEFT;
        receipt += ESCPOS.BOLD_ON;
        receipt += 'ITEMS:\n';
        receipt += ESCPOS.BOLD_OFF;

        job.items.forEach((item: any) => {
            const qtyStr = `x${item.qty}`;
            const name = item.name.length > 24
                ? item.name.substring(0, 21) + '...'
                : item.name;
            receipt += `${qtyStr.padEnd(4)} ${name}\n`;
        });

        receipt += line('=') + '\n';

        // Timestamp
        receipt += ESCPOS.ALIGN_CENTER;
        receipt += new Date().toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        }) + '\n';

        // Feed and cut
        receipt += ESCPOS.FEED;
        receipt += ESCPOS.PARTIAL_CUT;

        return receipt;
    };

    // Send data to printer
    const sendToPrinter = async (data: string): Promise<boolean> => {
        if (!printer?.characteristic) {
            toast({
                title: "No Printer",
                description: "Connect a Bluetooth printer first",
                variant: "destructive"
            });
            return false;
        }

        try {
            const encoder = new TextEncoder();
            const bytes = encoder.encode(data);

            // Send in chunks (BLE has max packet size)
            const chunkSize = 100;
            for (let i = 0; i < bytes.length; i += chunkSize) {
                const chunk = bytes.slice(i, i + chunkSize);
                if (printer.characteristic.properties.writeWithoutResponse) {
                    await printer.characteristic.writeValueWithoutResponse(chunk);
                } else {
                    await printer.characteristic.writeValueWithResponse(chunk);
                }
                // Small delay between chunks
                await new Promise(r => setTimeout(r, 50));
            }

            return true;
        } catch (error: any) {
            console.error('Print error:', error);
            toast({
                title: "Print Failed",
                description: error.message || "Failed to send to printer",
                variant: "destructive"
            });
            return false;
        }
    };

    // Handle print job with claim/complete/fail workflow
    const handlePrintJob = async (jobId: string) => {
        const job = jobs.find(j => j.id === jobId);
        if (!job) return;

        // 1. Claim the job first (prevents duplicate printing)
        const claimed = await claimJob(jobId);
        if (!claimed) {
            toast({
                title: "Already Claimed",
                description: "This job is being printed by another device",
                variant: "destructive"
            });
            return;
        }

        try {
            // 2. Generate and send to printer
            const receiptData = generateReceiptData(job);
            const printed = await sendToPrinter(receiptData);

            if (printed) {
                // 3. Mark as completed
                await completeJob(jobId);
                toast({
                    title: "Printed!",
                    description: `Token ${job.token} printed successfully`,
                });
            } else {
                throw new Error('Failed to send to printer');
            }
        } catch (error: any) {
            // 4. Mark as failed (will be retried)
            await failJob(jobId, error.message || 'Print failed');
            toast({
                title: "Print Failed",
                description: "Job will be retried automatically",
                variant: "destructive"
            });
        }
    };

    // Browser print fallback
    const handleBrowserPrint = (job: any) => {
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (!printWindow) return;

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Token ${job.token}</title>
                <style>
                    body {
                        font-family: 'Courier New', monospace;
                        width: 80mm;
                        margin: 0;
                        padding: 10px;
                        font-size: 12px;
                    }
                    .center { text-align: center; }
                    .bold { font-weight: bold; }
                    .big { font-size: 24px; }
                    .huge { font-size: 48px; }
                    hr { border: 1px dashed #000; }
                    .item { display: flex; justify-content: space-between; }
                    @media print {
                        body { width: 80mm; }
                    }
                </style>
            </head>
            <body>
                <div class="center bold big">KANTEEN</div>
                <div class="center">Kitchen Order</div>
                <hr>
                <div class="center bold huge">${job.token}</div>
                ${job.customerName ? `<div>Name: ${job.customerName}</div>` : ''}
                ${job.customerEmail ? `<div style="font-size:10px;color:#666;">${job.customerEmail.toLowerCase()}</div>` : ''}
                ${job.isParcel ? '<div class="center bold">*** PARCEL ***</div>' : ''}
                ${job.note ? `<hr><div class="bold">NOTE:</div><div style="background:#fff3cd;padding:5px;border-radius:4px;">${job.note}</div>` : ''}
                <hr>
                <div class="bold">ITEMS:</div>
                ${job.items.map((i: any) => `<div class="item"><span>x${i.qty}</span><span>${i.name}</span></div>`).join('')}
                <hr>
                <div class="center">${new Date().toLocaleString('en-IN')}</div>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    };

    if (authLoading || isAuthorized === null) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20">
            {/* Header */}
            <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3">
                <div className="container mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/staff/kitchen">
                            <Button variant="ghost" size="icon" className="shrink-0">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        </Link>
                        <div className="bg-primary/10 p-2 rounded-xl">
                            <Printer className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tight">Print Station</h1>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                {isListening ? 'Real-time listening...' : 'Paused'}
                            </p>
                        </div>
                    </div>

                    {/* Status indicators */}
                    <div className="flex items-center gap-2">
                        <Badge
                            variant={printer ? "default" : "secondary"}
                            className={cn(
                                "gap-1",
                                printer ? "bg-emerald-500" : ""
                            )}
                        >
                            {printer ? <Bluetooth className="h-3 w-3" /> : <BluetoothOff className="h-3 w-3" />}
                            {printer ? printer.name.slice(0, 10) : 'No Printer'}
                        </Badge>
                    </div>
                </div>
            </header>

            <main className="container mx-auto p-4 space-y-4">
                {/* Printer Connection Card */}
                <Card className="border-none shadow-sm">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "p-3 rounded-xl",
                                    printer ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
                                )}>
                                    <Bluetooth className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="font-bold">Bluetooth Printer</p>
                                    <p className="text-xs text-muted-foreground">
                                        {printer ? `Connected to ${printer.name}` : 'Not connected'}
                                    </p>
                                </div>
                            </div>

                            {printer ? (
                                <Button
                                    variant="outline"
                                    onClick={disconnectPrinter}
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                >
                                    Disconnect
                                </Button>
                            ) : (
                                <Button
                                    onClick={connectPrinter}
                                    disabled={connecting}
                                    className="bg-blue-600 hover:bg-blue-700"
                                >
                                    {connecting ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                        <Bluetooth className="h-4 w-4 mr-2" />
                                    )}
                                    Connect
                                </Button>
                            )}
                        </div>

                        {/* Settings */}
                        <div className="flex flex-col gap-3 pt-3 border-t">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                                    <span className="text-sm font-medium">Sound Alerts</span>
                                </div>
                                <Switch
                                    checked={soundEnabled}
                                    onCheckedChange={setSoundEnabled}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Printer className="h-4 w-4" />
                                    <span className="text-sm font-medium">Auto-Print</span>
                                    <span className="text-xs text-muted-foreground">(requires printer)</span>
                                </div>
                                <Switch
                                    checked={autoPrint}
                                    onCheckedChange={setAutoPrint}
                                    disabled={!printer}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Real-time Listening Control */}
                <Card className="border-none shadow-sm">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-bold">Order Listening</p>
                                <p className="text-xs text-muted-foreground">
                                    {isListening ? (
                                        <span className="flex items-center gap-1">
                                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                                            Real-time updates (instant)
                                        </span>
                                    ) : 'Not listening for orders'}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                {isListening ? (
                                    <Button
                                        variant="outline"
                                        onClick={stopListening}
                                        className="text-red-600"
                                    >
                                        Stop
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={startListening}
                                        className="bg-emerald-600 hover:bg-emerald-700"
                                    >
                                        Start Listening
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Error Display */}
                {error && (
                    <Card className="border-red-200 bg-red-50">
                        <CardContent className="p-4 flex items-center gap-3 text-red-600">
                            <AlertCircle className="h-5 w-5" />
                            <p className="text-sm font-medium">{error}</p>
                        </CardContent>
                    </Card>
                )}

                {/* Print Queue */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-black text-sm uppercase tracking-wider text-muted-foreground">
                            Print Queue
                        </h2>
                        <Badge variant="secondary" className="font-black">
                            {jobs.length} pending
                        </Badge>
                    </div>

                    {jobs.length === 0 ? (
                        <Card className="border-2 border-dashed border-slate-200">
                            <CardContent className="p-8 text-center">
                                <div className="bg-slate-100 p-4 rounded-full w-fit mx-auto mb-3">
                                    <Package className="h-8 w-8 text-slate-400" />
                                </div>
                                <p className="font-bold text-muted-foreground">No pending prints</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {isListening ? 'Waiting for new orders...' : 'Start listening to receive orders'}
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {jobs.map((job) => (
                                <Card key={job.id} className="border-none shadow-sm overflow-hidden">
                                    <CardContent className="p-0">
                                        <div className="flex">
                                            {/* Token number - left side */}
                                            <div className="bg-primary/10 p-4 flex flex-col items-center justify-center min-w-[80px]">
                                                <span className="text-3xl font-black text-primary">
                                                    {job.token}
                                                </span>
                                                {job.isParcel && (
                                                    <Badge variant="secondary" className="mt-1 text-[9px]">
                                                        PARCEL
                                                    </Badge>
                                                )}
                                            </div>

                                            {/* Order details */}
                                            <div className="flex-1 p-3">
                                                {job.customerName && (
                                                    <p className="font-bold text-sm truncate">
                                                        {job.customerName}
                                                    </p>
                                                )}
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    {job.items.slice(0, 3).map((item, i) => (
                                                        <span key={i}>
                                                            {item.qty}x {item.name}
                                                            {i < Math.min(job.items.length - 1, 2) && ', '}
                                                        </span>
                                                    ))}
                                                    {job.items.length > 3 && (
                                                        <span> +{job.items.length - 3} more</span>
                                                    )}
                                                </div>

                                                {/* Print buttons */}
                                                <div className="flex gap-2 mt-3">
                                                    {printer ? (
                                                        <Button
                                                            onClick={() => handlePrintJob(job.id)}
                                                            size="sm"
                                                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 font-bold"
                                                        >
                                                            <Printer className="h-4 w-4 mr-1" />
                                                            Print
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            onClick={() => handleBrowserPrint(job)}
                                                            size="sm"
                                                            variant="outline"
                                                            className="flex-1 font-bold"
                                                        >
                                                            <Printer className="h-4 w-4 mr-1" />
                                                            Browser Print
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                {/* Instructions */}
                <Card className="border-none bg-amber-50 dark:bg-amber-950/20">
                    <CardContent className="p-4">
                        <h3 className="font-bold text-amber-800 dark:text-amber-200 mb-2">
                            How to use:
                        </h3>
                        <ol className="text-xs text-amber-700 dark:text-amber-300 space-y-1 list-decimal list-inside">
                            <li>Turn on your Bluetooth printer</li>
                            <li>Tap "Connect" and select your printer</li>
                            <li>Tap "Start Listening" to receive orders</li>
                            <li>Enable "Auto-Print" for automatic printing</li>
                        </ol>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
