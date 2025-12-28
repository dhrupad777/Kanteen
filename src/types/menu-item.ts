/**
 * MenuItem - Orderable item from the menu_items Firestore collection.
 * This is separate from the daily display menu (canteen_state/today).
 */
export interface MenuItem {
    id: string;
    name: string;
    price: number;           // in rupees (e.g., 50)
    category: MenuCategory;
    isActive: boolean;       // item exists in catalog
    isAvailable: boolean;    // can be ordered now
    sortOrder: number;       // display order within category
    tags?: string[];         // ['veg', 'jain', 'spicy']
    imageUrl?: string;
    updatedAt?: any;
}

export type MenuCategory =
    | 'tea_beverage'
    | 'maggie'
    | 'sandwich'
    | 'dosa'
    | 'uttapam'
    | 'rava_dosa'
    | 'paratha'
    | 'chinese'
    | 'sabji'
    | 'indian_rice';

export const MENU_CATEGORIES: { value: MenuCategory; label: string }[] = [
    { value: 'tea_beverage', label: 'Tea & Beverages' },
    { value: 'maggie', label: 'Maggie' },
    { value: 'sandwich', label: 'Sandwich' },
    { value: 'dosa', label: 'Dosa' },
    { value: 'uttapam', label: 'Uttapam' },
    { value: 'rava_dosa', label: 'Rava Dosa' },
    { value: 'paratha', label: 'Paratha' },
    { value: 'chinese', label: 'Chinese' },
    { value: 'sabji', label: 'Sabji' },
    { value: 'indian_rice', label: 'Rice & Biryani' },
];

/**
 * CartItem - Item stored in the cart (local state + localStorage).
 */
export interface CartItem {
    itemId: string;
    name: string;
    price: number;
    qty: number;
    category: string;
}
