import type { MenuCategory } from '@/types/menu-item';

/**
 * When each menu category can be ordered.
 *
 * The kitchen does not cook everything all day: dosa batter is ready at 10, the
 * lunch line starts at 12, parathas run at lunch and dinner only. Before this,
 * students could order anything the moment the canteen opened and the kitchen
 * would get tickets it could not fill.
 *
 * Single source of truth, shared by the client (to grey out cards) and by
 * create-order (to actually refuse). Those must never disagree — a student who
 * can see an item but cannot buy it, or vice versa, is worse than either rule
 * on its own.
 *
 * All times are minutes since midnight IST, never device-local. A student whose
 * phone clock is wrong still sees and gets the same answer as the server.
 */

/** Kitchen-wide hours, matching the gate in create-order. */
export const KITCHEN_OPEN_MIN = 8 * 60;        // 08:00
export const KITCHEN_CLOSE_MIN = 20 * 60 + 45; // 20:45

/**
 * Slack allowed after a window CLOSES, so a student who was mid-checkout when the
 * lunch line ended can still pay. Deliberately one-sided: never applied to the
 * start of a window, because "cannot order before it is being cooked" is the
 * entire point. The kitchen-hours gate uses the same idea with 5 minutes.
 */
export const CLOSING_GRACE_MIN = 10;

export interface AvailabilityWindow {
    /** Inclusive, minutes since IST midnight. */
    startMin: number;
    /** Exclusive, minutes since IST midnight. */
    endMin: number;
}

const ALL_DAY: AvailabilityWindow = { startMin: KITCHEN_OPEN_MIN, endMin: KITCHEN_CLOSE_MIN };
const FROM_10: AvailabilityWindow = { startMin: 10 * 60, endMin: KITCHEN_CLOSE_MIN };
const FROM_12: AvailabilityWindow = { startMin: 12 * 60, endMin: KITCHEN_CLOSE_MIN };

/**
 * Typed as a total Record on purpose: adding a value to MenuCategory without
 * giving it a window is a compile error, not a category that silently becomes
 * orderable around the clock.
 */
export const CATEGORY_WINDOWS: Record<MenuCategory, readonly AvailabilityWindow[]> = {
    // Available from open — tea, maggie, sandwiches and the like.
    tea_beverage: [ALL_DAY],
    maggie: [ALL_DAY],
    sandwich: [ALL_DAY],

    // Batter is ready at 10.
    dosa: [FROM_10],
    uttapam: [FROM_10],
    rava_dosa: [FROM_10],

    // Lunch service and again at dinner.
    paratha: [
        { startMin: 12 * 60, endMin: 15 * 60 },          // 12:00–15:00
        { startMin: 19 * 60, endMin: KITCHEN_CLOSE_MIN }, // 19:00–20:45
    ],

    // The lunch line onwards.
    chinese: [FROM_12],
    sabji: [FROM_12],
    indian_rice: [FROM_12],
    daily_menu: [FROM_12],
    daily_regulars: [FROM_12],
};

/** Minutes since midnight IST, derived from an absolute instant (UTC+5:30). */
export function istMinutesOfDay(now: Date = new Date()): number {
    const ist = new Date(now.getTime() + (5 * 60 + 30) * 60_000);
    return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function windowsFor(category: string): readonly AvailabilityWindow[] {
    // An unknown category (stale doc, hand-edited Firestore) falls back to the
    // kitchen's own hours rather than to "always" or "never": it stays orderable
    // while the canteen is open, which is how it behaved before this existed.
    return CATEGORY_WINDOWS[category as MenuCategory] ?? [ALL_DAY];
}

export interface AvailabilityOptions {
    /** Extra minutes allowed past a window's end. Server passes CLOSING_GRACE_MIN. */
    graceMin?: number;
}

/** Whether this category can be ordered at `nowMin`. */
export function isCategoryAvailableAt(
    category: string,
    nowMin: number,
    { graceMin = 0 }: AvailabilityOptions = {},
): boolean {
    return windowsFor(category).some(
        (w) => nowMin >= w.startMin && nowMin < w.endMin + graceMin,
    );
}

/**
 * The next minute-of-day this category opens, or null if it has no further window
 * today. Drives the "From 10:00 AM" label.
 */
export function nextOpeningMinute(category: string, nowMin: number): number | null {
    const upcoming = windowsFor(category)
        .filter((w) => w.startMin > nowMin)
        .map((w) => w.startMin)
        .sort((a, b) => a - b);
    return upcoming.length > 0 ? upcoming[0] : null;
}

/**
 * How far through the wait we are, 0–1, for the fill indicator.
 *
 * Measured from when the student could plausibly have started waiting — the
 * kitchen opening, or the end of this category's previous window — so the bar
 * reflects this category's own schedule rather than the whole day.
 * Returns null when there is nothing to wait for.
 */
export function waitProgress(category: string, nowMin: number): number | null {
    const nextOpen = nextOpeningMinute(category, nowMin);
    if (nextOpen === null) return null;

    const previousEnd = windowsFor(category)
        .filter((w) => w.endMin <= nowMin)
        .map((w) => w.endMin)
        .sort((a, b) => b - a)[0];

    const waitStart = Math.max(KITCHEN_OPEN_MIN, previousEnd ?? KITCHEN_OPEN_MIN);
    const span = nextOpen - waitStart;
    if (span <= 0) return null;

    return Math.min(1, Math.max(0, (nowMin - waitStart) / span));
}

/** 615 -> "10:15 AM". Rendered for students, so 12-hour with a meridiem. */
export function formatIstMinute(min: number): string {
    const h24 = Math.floor(min / 60) % 24;
    const m = min % 60;
    const meridiem = h24 < 12 ? 'AM' : 'PM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${meridiem}`;
}

/** "From 10:00 AM" / "From 7:00 PM", or null when available now. */
export function availabilityLabel(category: string, nowMin: number): string | null {
    if (isCategoryAvailableAt(category, nowMin)) return null;
    const nextOpen = nextOpeningMinute(category, nowMin);
    return nextOpen === null ? 'Not available today' : `From ${formatIstMinute(nextOpen)}`;
}

/** Every window for a category, phrased for an error message. */
export function describeWindows(category: string): string {
    return windowsFor(category)
        .map((w) => `${formatIstMinute(w.startMin)}–${formatIstMinute(w.endMin)}`)
        .join(' and ');
}
