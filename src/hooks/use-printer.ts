import { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

// ESC/POS Commands
const ESC = '\x1B';
const GS = '\x1D';
const ESCPOS = {
    INIT: ESC + '@',
    ALIGN_CENTER: ESC + 'a' + '\x01',
    ALIGN_LEFT: ESC + 'a' + '\x00',
    ALIGN_RIGHT: ESC + 'a' + '\x02',
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

export interface BluetoothPrinter {
    device: BluetoothDevice;
    characteristic: BluetoothRemoteGATTCharacteristic | null;
    name: string;
}

async function findWritableCharacteristic(server: BluetoothRemoteGATTServer): Promise<BluetoothRemoteGATTCharacteristic | null> {
    const services = await server.getPrimaryServices();
    for (const service of services) {
        try {
            const chars = await service.getCharacteristics();
            for (const char of chars) {
                if (char.properties.write || char.properties.writeWithoutResponse) {
                    return char;
                }
            }
        } catch {
            // Some services don't expose characteristics — skip
        }
    }
    return null;
}

export function usePrinter() {
    const { toast } = useToast();
    const [printer, setPrinter] = useState<BluetoothPrinter | null>(null);
    const [connecting, setConnecting] = useState(false);
    const autoConnectAttemptedRef = useRef(false);

    // ─────────────────────────────────────────────────────────────────────
    // AUTO-RECONNECT: On mount, try to reconnect to a previously granted
    // device without requiring a user gesture.
    // navigator.bluetooth.getDevices() returns devices the user already
    // approved — works on Android Chrome without showing a picker.
    // ─────────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (autoConnectAttemptedRef.current) return;
        autoConnectAttemptedRef.current = true;

        async function tryAutoConnect() {
            if (typeof navigator === 'undefined' || !navigator.bluetooth) return;
            if (!('getDevices' in navigator.bluetooth)) return; // Not all browsers support this yet

            try {
                const devices: BluetoothDevice[] = await (navigator.bluetooth as any).getDevices();
                if (devices.length === 0) return;

                // Try each previously granted device until one connects
                for (const device of devices) {
                    try {
                        const server = await device.gatt?.connect();
                        if (!server) continue;

                        const characteristic = await findWritableCharacteristic(server);
                        if (!characteristic) continue;

                        const newPrinter = { device, characteristic, name: device.name || 'Printer' };
                        setPrinter(newPrinter);

                        device.addEventListener('gattserverdisconnected', () => {
                            setPrinter(null);
                            toast({
                                title: "Printer Disconnected",
                                description: `${device.name || 'Printer'} disconnected`,
                                variant: "destructive"
                            });
                        });

                        toast({ title: "Printer reconnected", description: `Auto-connected to ${device.name || 'printer'}` });
                        return; // Stop after first successful connection
                    } catch {
                        // Device not in range or failed — try next
                    }
                }
            } catch {
                // getDevices() failed silently — user will connect manually
            }
        }

        tryAutoConnect();
    }, [toast]);

    const connectBluetooth = async () => {
        if (!navigator.bluetooth) {
            toast({
                title: "Bluetooth Not Supported",
                description: "Your browser doesn't support Web Bluetooth.",
                variant: "destructive"
            });
            return null;
        }

        setConnecting(true);
        try {
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [
                    '000018f0-0000-1000-8000-00805f9b34fb',
                    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
                    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
                    '00001101-0000-1000-8000-00805f9b34fb',
                ]
            });

            toast({ title: "Connecting...", description: `Connecting to ${device.name || 'printer'}` });

            const server = await device.gatt?.connect();
            if (!server) throw new Error('Failed to connect to GATT server');

            const characteristic = await findWritableCharacteristic(server);
            if (!characteristic) throw new Error('No writable characteristic found');

            const newPrinter = { device, characteristic, name: device.name || 'Unknown Printer' };
            setPrinter(newPrinter);

            device.addEventListener('gattserverdisconnected', () => {
                setPrinter(null);
                toast({
                    title: "Printer Disconnected",
                    description: "Bluetooth connection lost",
                    variant: "destructive"
                });
            });

            toast({ title: "Connected!", description: `Connected to ${device.name || 'printer'}` });
            return newPrinter;

        } catch (error: any) {
            if (error.name !== 'NotFoundError') {
                toast({
                    title: "Connection Failed",
                    description: error.message || "Could not connect to printer",
                    variant: "destructive"
                });
            }
            return null;
        } finally {
            setConnecting(false);
        }
    };

    const disconnectBluetooth = () => {
        if (printer?.device.gatt?.connected) {
            printer.device.gatt.disconnect();
        }
        setPrinter(null);
    };

    const generateReceiptData = useCallback((job: any): string => {
        // 42 chars = standard 80mm thermal paper width
        const W = 42;
        const divider = (char = '-') => char.repeat(W) + '\n';

        // Right-align a value within a fixed total line width
        const totalLine = (label: string, value: string) => {
            const gap = W - label.length - value.length;
            return label + ' '.repeat(Math.max(1, gap)) + value + '\n';
        };

        let r = '';

        // ── Header ───────────────────────────────────────────────
        r += ESCPOS.INIT;
        r += ESCPOS.ALIGN_CENTER;
        r += ESCPOS.BOLD_ON + ESCPOS.DOUBLE_HEIGHT;
        r += 'MRC X Kanteen\n';
        r += ESCPOS.NORMAL_SIZE + ESCPOS.BOLD_OFF;

        // Token number — biggest thing on the receipt
        r += ESCPOS.DOUBLE_SIZE + ESCPOS.BOLD_ON;
        r += `TOKEN ${job.token}\n`;
        r += ESCPOS.NORMAL_SIZE + ESCPOS.BOLD_OFF;

        r += divider('=');

        // ── Customer name — double-height so staff can read it at a glance ──
        r += ESCPOS.ALIGN_LEFT;
        const customerName = job.customerName || job.userName || '';
        if (customerName) {
            r += ESCPOS.DOUBLE_HEIGHT + ESCPOS.BOLD_ON;
            r += `${customerName}\n`;
            r += ESCPOS.NORMAL_SIZE + ESCPOS.BOLD_OFF;
        }

        // ── Items — two-line format: bold name on line 1, price right-aligned on line 2 ──
        r += ESCPOS.ALIGN_LEFT;
        (job.items || []).forEach((item: any) => {
            const qty = item.qty || item.quantity || 1;
            const unitPrice = item.price || 0;
            const lineTotal = unitPrice * qty;

            // Line 1: qty + name — double-height + bold for easy reading
            r += ESCPOS.BOLD_ON + ESCPOS.DOUBLE_HEIGHT;
            r += `${qty}x ${item.name || ''}\n`;
            r += ESCPOS.NORMAL_SIZE + ESCPOS.BOLD_OFF;

            // Line 2: price right-aligned in normal size (only if price is known)
            if (lineTotal > 0) {
                const priceStr = `Rs.${lineTotal}`;
                r += ESCPOS.ALIGN_RIGHT;
                r += priceStr + '\n';
                r += ESCPOS.ALIGN_LEFT;
            }
        });

        r += divider();

        // ── Billing ───────────────────────────────────────────────
        r += ESCPOS.ALIGN_LEFT;
        if (job.parcelCharge > 0) {
            r += totalLine('Parcel Packaging', `Rs. ${job.parcelCharge}`);
        }
        r += totalLine('Platform Fee', 'Rs. 0');
        r += ESCPOS.DOUBLE_HEIGHT + ESCPOS.BOLD_ON;
        r += totalLine('TOTAL', `Rs. ${job.totalPrice || 0}`);
        r += ESCPOS.NORMAL_SIZE + ESCPOS.BOLD_OFF;

        r += divider();

        // ── NOTE — just above order-type banner so cook sees it last ──
        const noteWords = (job.note || '').trim().split(' ');
        const note = noteWords.slice(0, 30).join(' ') + (noteWords.length > 30 ? '…' : '');
        if (note.trim()) {
            r += ESCPOS.BOLD_ON;
            r += 'NOTE:\n';
            r += ESCPOS.BOLD_OFF;
            // Word-wrap to W chars, max 2 lines
            const words = note.split(' ');
            let currentLine = '';
            let lineCount = 0;
            const MAX_NOTE_LINES = 2;
            for (const word of words) {
                const candidate = (currentLine + ' ' + word).trim();
                if (candidate.length <= W) {
                    currentLine = candidate;
                } else {
                    if (lineCount >= MAX_NOTE_LINES - 1) {
                        // Would exceed 2 lines — truncate last line
                        const truncated = currentLine.length > W - 3
                            ? currentLine.slice(0, W - 3) + '...'
                            : currentLine + '...';
                        r += truncated + '\n';
                        lineCount++;
                        break;
                    }
                    r += currentLine + '\n';
                    lineCount++;
                    currentLine = word;
                }
            }
            if (currentLine && lineCount < MAX_NOTE_LINES) r += currentLine + '\n';
            r += divider();
        }

        // ── PARCEL / ONLINE-ORDER — large, unmissable ─────────────
        r += divider('=');
        r += ESCPOS.ALIGN_CENTER;
        r += ESCPOS.DOUBLE_SIZE + ESCPOS.BOLD_ON;
        r += (job.isParcel || job.type === 'takeaway') ? 'PARCEL\n' : 'ONLINE-ORDER\n';
        r += ESCPOS.NORMAL_SIZE + ESCPOS.BOLD_OFF;
        r += divider('=');

        // ── Timestamp ─────────────────────────────────────────────
        r += ESCPOS.ALIGN_CENTER;
        r += new Date().toLocaleString('en-IN', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
        }) + '\n';

        r += ESCPOS.FEED;
        r += ESCPOS.PARTIAL_CUT;

        return r;
    }, []);

    const sendToBluetoothPrinter = async (data: string, activePrinter = printer): Promise<boolean> => {
        if (!activePrinter?.characteristic) {
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
            const chunkSize = 100;

            for (let i = 0; i < bytes.length; i += chunkSize) {
                const chunk = bytes.slice(i, i + chunkSize);
                if (activePrinter.characteristic.properties.writeWithoutResponse) {
                    await activePrinter.characteristic.writeValueWithoutResponse(chunk);
                } else {
                    await activePrinter.characteristic.writeValueWithResponse(chunk);
                }
                await new Promise(r => setTimeout(r, 50));
            }
            return true;
        } catch (error: any) {
            toast({
                title: "Print Failed",
                description: error.message || "Failed to send to printer",
                variant: "destructive"
            });
            return false;
        }
    };

    return {
        printer,
        connecting,
        connectBluetooth,
        disconnectBluetooth,
        generateReceiptData,
        sendToBluetoothPrinter,
    };
}
