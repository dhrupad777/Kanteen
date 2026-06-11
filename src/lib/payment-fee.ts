/**
 * Razorpay gateway-fee gross-up math.
 *
 * Razorpay deducts 2% + 18% GST on the platform fee = 2.36% per transaction.
 * To make sure the merchant nets the cart subtotal exactly, we gross up the
 * checkout total instead of naively adding 2.36% to the subtotal.
 *
 *   retention_rate = 1 - 0.0236 = 0.9764
 *   gross_total    = target_revenue / retention_rate
 *   gateway_fee    = gross_total - target_revenue
 *
 * Both client (cart UI) and server (create-order route) import this so the
 * displayed and charged amounts always agree.
 */
export const RAZORPAY_RETENTION_RATE = 0.9764;

export interface PaymentBreakdown {
    /** What Kanteen wants to net (items + parcel + platform charges). */
    targetRevenue: number;
    /** Extra amount the customer pays to cover Razorpay's deduction. */
    gatewayFee: number;
    /** What the customer is actually charged at checkout. */
    grossTotal: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculatePaymentBreakdown(targetRevenue: number): PaymentBreakdown {
    const safeTarget = round2(Math.max(0, Number(targetRevenue) || 0));
    const grossTotal = round2(safeTarget / RAZORPAY_RETENTION_RATE);
    const gatewayFee = round2(grossTotal - safeTarget);
    return { targetRevenue: safeTarget, gatewayFee, grossTotal };
}
