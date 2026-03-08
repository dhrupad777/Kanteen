import { useState, useCallback } from 'react';
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

export function usePrinter() {
    const { toast } = useToast();
    const [printer, setPrinter] = useState<BluetoothPrinter | null>(null);
    const [connecting, setConnecting] = useState(false);

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
                // Show ALL nearby Bluetooth devices so any printer model is visible
                acceptAllDevices: true,
                optionalServices: [
                    '000018f0-0000-1000-8000-00805f9b34fb',
                    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
                    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
                    '00001101-0000-1000-8000-00805f9b34fb', // SPP (Serial Port Profile)
                ]
            });

            toast({ title: "Connecting...", description: `Connecting to ${device.name || 'printer'}` });

            const server = await device.gatt?.connect();
            if (!server) throw new Error('Failed to connect to GATT server');

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
            console.error('Bluetooth connection error:', error);
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
            const name = item.name.length > 27 ? item.name.substring(0, 24) + '...' : item.name;
            receipt += `${qtyStr.padEnd(4)} ${name}\n`;
        });

        if (job.note) {
            receipt += line('-') + '\n';
            receipt += ESCPOS.BOLD_ON;
            receipt += `NOTE: ${job.note}\n`;
            receipt += ESCPOS.BOLD_OFF;
        }

        receipt += line('-') + '\n';

        receipt += ESCPOS.ALIGN_LEFT;
        if (job.customerName || job.userName) receipt += `Name: ${job.customerName || job.userName}\n`;
        if (job.isParcel || job.type === 'takeaway') receipt += '*** PARCEL ***\n';

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
            console.error('Print error:', error);
            toast({
                title: "Print Failed",
                description: error.message || "Failed to send to printer",
                variant: "destructive"
            });
            return false;
        }
    };

    const printSystemReceipt = (job: any, isAutoPrint = false): Promise<boolean> => {
        return new Promise((resolve, reject) => {
            try {
                const printWindow = window.open('', '_blank', 'width=400,height=600');
                if (!printWindow) {
                    throw new Error("Pop-up blocked. Please allow pop-ups for auto-printing.");
                }

                const items = job.items || [];

                const htmlContent = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Token ${job.token}</title>
                        <style>
                            body {
                                font-family: 'Courier New', Courier, monospace;
                                margin: 0;
                                padding: 0;
                                background-color: white;
                                color: black;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            }
                            .receipt {
                                width: 80mm;
                                padding: 5mm;
                                box-sizing: border-box;
                                font-size: 12px;
                                line-height: 1.2;
                            }
                            .center { text-align: center; }
                            .bold { font-weight: bold; }
                            .divider { border-top: 1px dashed black; margin: 5px 0; }
                            table { width: 100%; border-collapse: collapse; font-size: 12px; }
                            th, td { text-align: left; padding: 2px 0; }
                            .right { text-align: right; }
                            @media print {
                                @page { size: 80mm auto; margin: 0; }
                                body { margin: 0; padding: 0; display: block; }
                                .receipt { width: 100%; padding: 0; margin: 0; }
                            }
                        </style>
                    </head>
                    <body>
                        <div class="receipt">
                            <div class="center">
                                <h2 style="margin: 0;">KANTEEN</h2>
                                <h1 style="margin: 5px 0; font-size: 24px;">Token: ${job.token}</h1>
                            </div>
                            <div class="divider"></div>
                            ${(job.customerName || job.userName) ? '<p style="margin: 5px 0;">Name: ' + (job.customerName || job.userName) + '</p>' : ''}
                            ${(job.isParcel || job.type === 'takeaway') ? '<div class="center bold" style="font-size: 16px;">*** PARCEL ***</div>' : ''}
                            <p style="margin: 0 0 5px 0;">Date: ${new Date().toLocaleString('en-IN')}</p>
                            <div class="divider"></div>
                            <table>
                                <thead><tr><th>Item</th><th class="right">Qty</th></tr></thead>
                                <tbody>
                                    ${items.map((i: any) => '<tr><td>' + i.name + '</td><td class="right">' + (i.qty || i.quantity) + '</td></tr>').join('')}
                                </tbody>
                            </table>
                            ${job.note ? '<div class="divider"></div><p class="bold">NOTE: ' + job.note + '</p>' : ''}
                            <div class="divider"></div>
                            <div class="center" style="margin-top: 10px;">
                                <p class="bold">THANK YOU!</p>
                                <br/><br/><br/>
                            </div>
                        </div>
                        <script>
                            window.onload = () => {
                                window.print();
                                ${isAutoPrint ? 'setTimeout(() => window.close(), 500);' : ''}
                            };
                        </script>
                    </body>
                    </html>
                `;

                printWindow.document.write(htmlContent);
                printWindow.document.close();
                resolve(true);
            } catch (err: any) {
                toast({
                    title: "Print Failed",
                    description: err.message || "Please check your pop-up blocker",
                    variant: "destructive"
                });
                reject(err);
            }
        });
    };

    return {
        printer,
        connecting,
        connectBluetooth,
        disconnectBluetooth,
        generateReceiptData,
        sendToBluetoothPrinter,
        printSystemReceipt
    };
}
