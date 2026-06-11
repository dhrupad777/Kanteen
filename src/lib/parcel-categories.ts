/**
 * Parcel packaging classification by menu category.
 *
 * - Container categories need a physical container: ₹5 per item.
 * - Bag categories only need a packing bag: flat ₹5 regardless of quantity
 *   (upgrades to ₹5/item when a container item is also parcelled).
 * - No-parcel categories are never charged and have no toggle (tea & beverages).
 * - daily_menu (Main Course) is always parcelled at a flat ₹5 total.
 * - daily_regulars (Extra Items) are free when Main Course is in cart,
 *   otherwise flat ₹5 total.
 */
import type { MenuCategory } from '@/types/menu-item';

/** Categories where parcel is never offered (no toggle, no charge). */
export const NO_PARCEL_CATEGORIES: ReadonlySet<MenuCategory> = new Set([
    'tea_beverage',
]);

/** Categories that need a physical container: ₹5 per item. */
export const CONTAINER_CATEGORIES: ReadonlySet<MenuCategory> = new Set([
    'sabji',
    'chinese',
    'indian_rice',
    'maggie',
]);

/** Categories that only need a packing bag: flat ₹5 total (unless upgraded). */
export const BAG_CATEGORIES: ReadonlySet<MenuCategory> = new Set([
    'dosa',
    'uttapam',
    'rava_dosa',
    'paratha',
    'sandwich',
]);

export function isContainerCategory(cat: string): boolean {
    return CONTAINER_CATEGORIES.has(cat as MenuCategory);
}

export function isBagCategory(cat: string): boolean {
    return BAG_CATEGORIES.has(cat as MenuCategory);
}

export function isNoParcelCategory(cat: string): boolean {
    return NO_PARCEL_CATEGORIES.has(cat as MenuCategory);
}
