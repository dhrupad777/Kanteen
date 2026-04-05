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
                        font-size: 14px;
                        line-height: 1.2;
                        padding: 0;
                        margin: 0;
                        box-shadow: none;
                        border: none;
                    }
                    @page { margin: 0; size: 80mm auto; }
                    .no-print {
                        display: none !important;
                    }
                }
            `}</style>

            <div className="receipt-content bg-white p-2 max-w-[300px] mx-auto border border-gray-200 shadow-sm rounded font-mono text-sm">
                {/* Header */}
                <div className="text-center mb-1">
                    <h1 className="text-2xl font-bold">KANTEEN</h1>
                </div>

                {/* Token Number - Large and prominent */}
                <div className="text-center my-1">
                    <p className="text-4xl font-black">{job.token}</p>
                </div>

                {/* Divider */}
                <div className="border-t border-dashed border-black my-2"></div>

                {/* Order Items */}
                <div className="mb-2">
                    <table className="w-full text-sm">
                        <tbody>
                            {job.items.map((item, index) => (
                                <tr key={index} className="align-top">
                                    <td className="pr-2 font-bold w-6">{item.quantity}x</td>
                                    <td className="text-left leading-tight">{item.name}</td>
                                    <td className="text-right whitespace-nowrap pl-2">Rs.{(item.price * item.quantity).toFixed(0)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="border-t border-dashed border-black my-1"></div>
                <div className="flex justify-between font-bold text-sm">
                    <span>TOTAL</span>
                    <span>Rs.{job.totalPrice.toFixed(2)}</span>
                </div>

                {job.note && (
                    <>
                        <div className="border-t border-dashed border-black my-2"></div>
                        <div className="font-bold text-sm">
                            NOTE: {job.note.split(' ').slice(0, 30).join(' ')}{job.note.split(' ').length > 30 ? '…' : ''}
                        </div>
                    </>
                )}

                <div className="border-t border-dashed border-black my-2"></div>

                {/* Customer Info */}
                {(job.customerName || job.customerEmail) && (
                    <div className="text-sm">
                        {job.customerName && (
                            <p>Name: {job.customerName}</p>
                        )}
                    </div>
                )}

                {/* Order Type */}
                {job.isParcel && (
                    <div className="text-center font-bold text-sm my-1">
                        *** PARCEL ***
                    </div>
                )}

                {/* Timestamp */}
                <div className="text-center text-[11px] mt-2">
                    <p>{format(job.createdAt, 'dd MMM yyyy, HH:mm')}</p>
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
        const price = `Rs.${item.price.toFixed(0)}`.padStart(7);
        lines.push(`${name} ${qty} ${price}`);
    });

    lines.push(line('='));

    // Total
    lines.push(leftRight('TOTAL:', `Rs.${job.totalPrice.toFixed(2)}`));
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
