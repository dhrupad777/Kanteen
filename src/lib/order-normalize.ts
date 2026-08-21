/**
 * Single source of truth for turning a raw Firestore order document into a
 * shape the UI can always render.
 *
 * Why this exists: Firestore documents are schemaless, and not every writer
 * fills every field. A manual coupon order written without `totalPrice` once
 * took down every dashboard, because `order.totalPrice.toFixed(2)` threw during
 * render and tripped the error boundary. Firestore rules expose any
 * Preparing/Ready order to every signed-in user, so a single malformed document
 * is visible to everyone.
 *
 * The mapping used to be copy-pasted across the public API route and four
 * places in the order provider, which is exactly why one of them was missing a
 * guard. Every read path now goes through here instead.
 *
 * Rule: numeric fields the UI does arithmetic or .toFixed() on are never
 * optional coming out of this module — they default to 0.
 */
import type { Order } from '@/types';

/** Coerce anything Firestore hands us into a finite number (NaN/null/undefined/string -> 0). */
export function toOrderNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Line items with guaranteed-numeric price/quantity. Menu items stored with
 *  `price: null` (MRP-priced tea & beverages) would otherwise reach receipts. */
export function normalizeOrderItems(items: unknown): Order['items'] {
    if (!Array.isArray(items)) return [];
    return items.map((item: any) => ({
        ...item,
        name: typeof item?.name === 'string' ? item.name : 'Item',
        quantity: toOrderNumber(item?.quantity),
        price: toOrderNumber(item?.price),
    }));
}

/**
 * The render-safe fields shared by every order read path.
 *
 * Callers layer on anything privacy-sensitive themselves — notably `secretOtp`,
 * which must only ever be attached for the order's own owner.
 */
export function normalizeOrderCore(id: string, data: any) {
    return {
        id,
        studentId: data?.studentId,
        items: normalizeOrderItems(data?.items),
        status: data?.status,
        token: data?.token,
        totalPrice: toOrderNumber(data?.totalPrice),
        subtotal: toOrderNumber(data?.subtotal),
        parcelCharge: toOrderNumber(data?.parcelCharge),
        platformCharges: toOrderNumber(data?.platformCharges),
        paymentGatewayFee: toOrderNumber(data?.paymentGatewayFee),
        isParcel: data?.isParcel ?? false,
        note: data?.note,
        dateKey: data?.dateKey,
        kitchen: data?.kitchen,
        userEmail: data?.userEmail,
        userName: data?.userName,
    };
}
