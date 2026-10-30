/**
 * Shared parcel-charge calculation used by both the cart UI (client)
 * and the create-order API route (server).
 *
 * Keeps a single source of truth so client and server always agree.
 */
import { isContainerCategory, isBagCategory } from './parcel-categories';

export interface ParcelItem {
    category: string;
    qty: number;
    wantParcel: boolean;
}

export interface ParcelBreakdown {
    /** Flat ₹5 if any daily_menu item is in the order. */
    mainCourseParcel: number;
    /** ₹5 × qty for each parcelled container-category item. */
    containerParcel: number;
    /** Flat ₹5 if any bag-category item is parcelled (one bag covers them all). */
    bagParcel: number;
    /** Flat ₹5 if extras are parcelled without Main Course; 0 otherwise. */
    dailyRegularsParcel: number;
    /** Sum of all parcel charges. */
    totalParcelCharge: number;
    /** True when any parcel charge applies (for receipt "PARCEL" label). */
    isParcel: boolean;
}

export function calculateParcelCharge(items: ParcelItem[]): ParcelBreakdown {
    const hasDailyMenu = items.some(i => i.category === 'daily_menu');

    // 1. Main Course: flat ₹5 if any daily_menu item exists
    const mainCourseParcel = hasDailyMenu ? 5 : 0;

    // 2. Container items: ₹5 per item when parcelled
    const parcelledContainerItems = items.filter(
        i => isContainerCategory(i.category) && i.wantParcel,
    );
    const containerParcel = parcelledContainerItems.reduce((sum, i) => sum + 5 * i.qty, 0);

    // 3. Bag items: one flat ₹5 covers every parcelled bag item, whatever the category
    //    e.g. 3 dosas = ₹5, 3 dosas + 2 sandwiches = ₹5
    const hasParcelledBagItems = items.some(i => isBagCategory(i.category) && i.wantParcel);
    const bagParcel = hasParcelledBagItems ? 5 : 0;

    // 4. Daily regulars: free with Main Course, else flat ₹5
    const hasParcelledRegulars = items.some(
        i => i.category === 'daily_regulars' && i.wantParcel,
    );
    const dailyRegularsParcel = hasParcelledRegulars && !hasDailyMenu ? 5 : 0;

    const totalParcelCharge = mainCourseParcel + containerParcel + bagParcel + dailyRegularsParcel;
    const isParcel = totalParcelCharge > 0;

    return {
        mainCourseParcel,
        containerParcel,
        bagParcel,
        dailyRegularsParcel,
        totalParcelCharge,
        isParcel,
    };
}
