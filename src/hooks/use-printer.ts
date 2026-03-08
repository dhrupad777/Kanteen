import { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

// ESC/POS Commands
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
        const width = 32;
        const line = (char: string = '-') => char.repeat(width);
        let receipt = '';

        receipt += ESCPOS.INIT;
        receipt += ESCPOS.ALIGN_CENTER;
        receipt += ESCPOS.BOLD_ON;
        receipt += ESCPOS.DOUBLE_HEIGHT;
        receipt += 'KANTEEN\n';
        receipt += ESCPOS.NORMAL_SIZE;

        receipt += ESCPOS.DOUBLE_SIZE;
        receipt += `${job.token}\n`;
        receipt += ESCPOS.NORMAL_SIZE;
        receipt += ESCPOS.BOLD_OFF;

        receipt += line('-') + '\n';

        receipt += ESCPOS.ALIGN_LEFT;
        job.items?.forEach((item: any) => {
            const qtyStr = `${item.qty || item.quantity}x`;
            const nameMaxWidth = 20;
            const nameStr = item.name.length > nameMaxWidth ? item.name.substring(0, nameMaxWidth - 3) + '...' : item.name.padEnd(nameMaxWidth);
            const price = item.price ? (item.price * (item.qty || item.quantity)) : 0;
            const priceStr = price > 0 ? price.toString().padStart(5) : '    0';
            receipt += `${qtyStr.padEnd(4)} ${nameStr} ${priceStr}\n`;
        });

        receipt += line('-') + '\n';

        // Platform convenience fee and Total
        receipt += ESCPOS.ALIGN_LEFT;
        receipt += `Platform Fee           Rs. 0\n`;
        if (job.totalPrice) {
            receipt += ESCPOS.BOLD_ON;
            receipt += `Total                  Rs. ${job.totalPrice}\n`;
            receipt += ESCPOS.BOLD_OFF;
        }

        if (job.note && job.note.trim() !== '') {
            receipt += line('-') + '\n';
            receipt += ESCPOS.BOLD_ON;
            receipt += `NOTE:\n${job.note}\n`;
            receipt += ESCPOS.BOLD_OFF;
        }

        receipt += line('-') + '\n';

        if (job.customerName || job.userName) receipt += `Name: ${job.customerName || job.userName}\n`;

        // PARCEL or DINE-IN in Big Words
        receipt += line('-') + '\n';
        receipt += ESCPOS.ALIGN_CENTER;
        receipt += ESCPOS.DOUBLE_SIZE;
        receipt += ESCPOS.BOLD_ON;
        if (job.isParcel || job.type === 'takeaway') {
            receipt += '*** PARCEL ***\n';
        } else {
            receipt += '*** DINE-IN ***\n';
        }
        receipt += ESCPOS.NORMAL_SIZE;
        receipt += ESCPOS.BOLD_OFF;
        receipt += line('-') + '\n';

        receipt += ESCPOS.ALIGN_CENTER;
        receipt += new Date().toLocaleString('en-IN', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
        }) + '\n';

        receipt += ESCPOS.FEED;
        receipt += ESCPOS.PARTIAL_CUT;

        return receipt;
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
