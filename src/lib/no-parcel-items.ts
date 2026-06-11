/**
 * Items that NEVER incur a parcel/packaging charge, regardless of the
 * student's parcel toggle. Match is by case-insensitive name.
 *
 * Used by both:
 *   - cart UI (src/app/cart/page.tsx) — to skip the ₹5 "other parcel"
 *     surcharge and render a "Free" badge instead of the toggle.
 *   - server (src/app/api/razorpay/create-order/route.ts) — to skip the
 *     hasNormalItems flag so the ₹5 base parcel isn't triggered when these
 *     items are mixed with daily-menu items.
 */
export const NO_PARCEL_ITEM_NAMES = new Set<string>([
    'extra roti',
    'roti', // legacy — kept in case any seed/script still inserts "Roti"
    'pav',
    'bread',
    'chaas',
    'dahi',
    'doodh',
    'bournvita',
    'bournvita (1 glass)',
    'milk',
    'lassi',
    'butter milk',
]);

export function isNoParcelItem(name: string | undefined | null): boolean {
    if (!name) return false;
    return NO_PARCEL_ITEM_NAMES.has(name.trim().toLowerCase());
}
