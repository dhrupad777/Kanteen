"use client";

import { PrintJob } from '@/types';
import { format } from 'date-fns';

interface ReceiptProps {
    job: PrintJob;
    showPrintButton?: boolean;
    onPrint?: () => void;
}

/**
 * Receipt component for displaying and printing order receipts.
 * Designed for thermal printers (typically 58mm or 80mm width).
 */
export function Receipt({ job, showPrintButton = false, onPrint }: ReceiptProps) {
    const handlePrint = () => {
        window.print();
        onPrint?.();
    };

    return (
        <div className="receipt-container">
            {/* Print styles - hidden on screen, visible when printing */}
            <style jsx>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .receipt-content,
                    .receipt-content * {
                        visibility: visible;
                    }
                    .receipt-content {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 80mm;
                        font-family: 'Courier New', monospace;
                        font-size: 12px;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}</style>

            <div className="receipt-content bg-white p-4 max-w-[300px] mx-auto border border-gray-200 shadow-sm rounded font-mono text-sm">
                {/* Header */}
                <div className="text-center mb-4 border-b border-dashed border-gray-400 pb-3">
                    <h1 className="text-xl font-bold">KANTEEN</h1>
                    <p className="text-xs text-gray-600">Order Receipt</p>
                </div>

                {/* Token Number - Large and prominent */}
                <div className="text-center my-4 py-3 bg-gray-100 rounded">
                    <p className="text-xs text-gray-600 uppercase tracking-wider">Token Number</p>
                    <p className="text-5xl font-black text-primary">{job.token}</p>
                </div>

                {/* Customer Info */}
                {(job.customerName || job.customerEmail) && (
                    <div className="mb-3 text-xs">
                        {job.customerName && (
                            <p><span className="text-gray-500">Name:</span> {job.customerName}</p>
                        )}
                    </div>
                )}

                {/* Order Type */}
                {job.isParcel && (
                    <div className="text-center mb-3">
                        <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs font-bold uppercase">
                            Parcel Order
                        </span>
                    </div>
                )}

                {/* Order Items */}
                <div className="border-t border-dashed border-gray-400 pt-3 mb-3">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-gray-300">
                                <th className="text-left py-1">Item</th>
                                <th className="text-center py-1">Qty</th>
                                <th className="text-right py-1">Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {job.items.map((item, index) => (
                                <tr key={index} className="border-b border-gray-200">
                                    <td className="py-1 pr-2">{item.name}</td>
                                    <td className="text-center py-1">{item.quantity}</td>
                                    <td className="text-right py-1">₹{item.price.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Total */}
                <div className="border-t border-double border-gray-400 pt-2 mb-4">
                    <div className="flex justify-between font-bold text-base">
                        <span>TOTAL</span>
                        <span>₹{job.totalPrice.toFixed(2)}</span>
                    </div>
                </div>

                {/* Timestamp */}
                <div className="text-center text-xs text-gray-500 border-t border-dashed border-gray-400 pt-3">
                    <p>{format(job.createdAt, 'dd MMM yyyy, hh:mm a')}</p>
                    <p className="mt-1">Order ID: {job.orderId.slice(-8)}</p>
                </div>

                {/* Footer */}
                <div className="text-center mt-4 text-xs text-gray-500">
                    <p>Thank you for your order!</p>
                    <p className="text-[10px] mt-1">Please show this receipt when collecting</p>
                </div>
            </div>

            {/* Print Button */}
            {showPrintButton && (
                <div className="no-print text-center mt-4">
                    <button
                        onClick={handlePrint}
                        className="px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-colors"
                    >
                        Print Receipt
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * Generates receipt text for thermal printers (ESC/POS compatible).
 * Returns plain text that can be sent directly to the printer.
 */
export function generateReceiptText(job: PrintJob): string {
    const lines: string[] = [];
    const width = 32; // Standard thermal printer width in characters

    const center = (text: string) => {
        const padding = Math.max(0, Math.floor((width - text.length) / 2));
        return ' '.repeat(padding) + text;
    };

    const line = (char: string = '-') => char.repeat(width);

    const leftRight = (left: string, right: string) => {
        const spaces = Math.max(1, width - left.length - right.length);
        return left + ' '.repeat(spaces) + right;
    };

    // Header
    lines.push(center('KANTEEN'));
    lines.push(center('Order Receipt'));
    lines.push(line('='));
    lines.push('');

    // Token Number
    lines.push(center('TOKEN NUMBER'));
    lines.push(center(`*** ${job.token} ***`));
    lines.push('');

    // Customer Info
    if (job.customerName) {
        lines.push(`Name: ${job.customerName}`);
    }
    if (job.isParcel) {
        lines.push(center('** PARCEL ORDER **'));
    }
    lines.push(line());

    // Items
    lines.push('ITEM                 QTY   PRICE');
    lines.push(line('-'));

    job.items.forEach(item => {
        const name = item.name.length > 20 ? item.name.slice(0, 17) + '...' : item.name.padEnd(20);
        const qty = String(item.quantity).padStart(3);
        const price = `₹${item.price.toFixed(0)}`.padStart(7);
        lines.push(`${name} ${qty} ${price}`);
    });

    lines.push(line('='));

    // Total
    lines.push(leftRight('TOTAL:', `₹${job.totalPrice.toFixed(2)}`));
    lines.push(line('='));
    lines.push('');

    // Timestamp
    lines.push(center(format(job.createdAt, 'dd/MM/yyyy HH:mm')));
    lines.push(center(`ID: ${job.orderId.slice(-8)}`));
    lines.push('');

    // Footer
    lines.push(center('Thank you!'));
    lines.push(center('Show when collecting'));
    lines.push('');
    lines.push('');
    lines.push(''); // Extra lines for paper feed

    return lines.join('\n');
}
