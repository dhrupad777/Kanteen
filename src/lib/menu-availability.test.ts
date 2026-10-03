import { describe, it, expect } from 'vitest';
import {
    CATEGORY_WINDOWS,
    CLOSING_GRACE_MIN,
    KITCHEN_CLOSE_MIN,
    KITCHEN_OPEN_MIN,
    availabilityLabel,
    describeWindows,
    formatIstMinute,
    isCategoryAvailableAt,
    istMinutesOfDay,
    waitProgress,
} from './menu-availability';
import { MENU_CATEGORIES } from '@/types/menu-item';

/** 'HH:MM' -> minutes since midnight, so these read like the kitchen's schedule. */
const at = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

describe('istMinutesOfDay', () => {
    it('converts an absolute instant to IST, not to the machine timezone', () => {
        // 04:30 UTC is exactly 10:00 IST. This fails on a machine-local
        // implementation anywhere outside IST, which is the bug it guards.
        expect(istMinutesOfDay(new Date('2026-10-03T04:30:00Z'))).toBe(at('10:00'));
    });

    it('handles the UTC day boundary', () => {
        // 20:00 UTC is 01:30 IST the following day.
        expect(istMinutesOfDay(new Date('2026-10-03T20:00:00Z'))).toBe(at('01:30'));
    });
});

describe('breakfast items - available from open', () => {
    for (const cat of ['tea_beverage', 'maggie', 'sandwich']) {
        it(`${cat} is orderable the moment the canteen opens`, () => {
            expect(isCategoryAvailableAt(cat, KITCHEN_OPEN_MIN)).toBe(true);
            expect(availabilityLabel(cat, KITCHEN_OPEN_MIN)).toBeNull();
        });

        it(`${cat} is not orderable before opening`, () => {
            expect(isCategoryAvailableAt(cat, at('07:59'))).toBe(false);
        });
    }
});

describe('dosa family - from 10:00', () => {
    for (const cat of ['dosa', 'uttapam', 'rava_dosa']) {
        it(`${cat} is locked at 09:59 and open at 10:00`, () => {
            expect(isCategoryAvailableAt(cat, at('09:59'))).toBe(false);
            expect(isCategoryAvailableAt(cat, at('10:00'))).toBe(true);
        });

        it(`${cat} tells the student when it opens`, () => {
            expect(availabilityLabel(cat, at('09:00'))).toBe('From 10:00 AM');
        });

        it(`${cat} stays available until closing`, () => {
            expect(isCategoryAvailableAt(cat, KITCHEN_CLOSE_MIN - 1)).toBe(true);
            expect(isCategoryAvailableAt(cat, KITCHEN_CLOSE_MIN)).toBe(false);
        });
    }
});

describe('lunch-onwards categories - from 12:00', () => {
    for (const cat of ['chinese', 'sabji', 'indian_rice', 'daily_menu', 'daily_regulars']) {
        it(`${cat} is locked at 11:59 and open at 12:00`, () => {
            expect(isCategoryAvailableAt(cat, at('11:59'))).toBe(false);
            expect(isCategoryAvailableAt(cat, at('12:00'))).toBe(true);
        });
    }
});

describe('paratha - two windows', () => {
    it('is closed in the morning', () => {
        expect(isCategoryAvailableAt('paratha', at('11:30'))).toBe(false);
    });

    it('is open across lunch', () => {
        expect(isCategoryAvailableAt('paratha', at('12:00'))).toBe(true);
        expect(isCategoryAvailableAt('paratha', at('14:59'))).toBe(true);
    });

    it('closes at 15:00 and stays shut through the afternoon', () => {
        expect(isCategoryAvailableAt('paratha', at('15:00'))).toBe(false);
        expect(isCategoryAvailableAt('paratha', at('17:00'))).toBe(false);
        expect(isCategoryAvailableAt('paratha', at('18:59'))).toBe(false);
    });

    it('reopens for dinner and closes with the kitchen', () => {
        expect(isCategoryAvailableAt('paratha', at('19:00'))).toBe(true);
        expect(isCategoryAvailableAt('paratha', at('20:44'))).toBe(true);
        expect(isCategoryAvailableAt('paratha', KITCHEN_CLOSE_MIN)).toBe(false);
    });

    it('points at the correct next window from either side of the gap', () => {
        expect(availabilityLabel('paratha', at('09:00'))).toBe('From 12:00 PM');
        expect(availabilityLabel('paratha', at('16:00'))).toBe('From 7:00 PM');
    });
});

describe('closing grace - the stale-cart case', () => {
    it('lets a student who was mid-checkout at 2:55 still pay at 3:05', () => {
        // The exact scenario this behaviour was specified from.
        expect(isCategoryAvailableAt('paratha', at('15:05'), { graceMin: CLOSING_GRACE_MIN })).toBe(true);
    });

    it('runs out eventually', () => {
        expect(isCategoryAvailableAt('paratha', at('15:11'), { graceMin: CLOSING_GRACE_MIN })).toBe(false);
    });

    it('is NEVER applied to the start of a window', () => {
        // The core guarantee of the feature: grace must not make an item orderable
        // before the kitchen is making it.
        expect(isCategoryAvailableAt('dosa', at('09:55'), { graceMin: CLOSING_GRACE_MIN })).toBe(false);
        expect(isCategoryAvailableAt('paratha', at('11:55'), { graceMin: CLOSING_GRACE_MIN })).toBe(false);
        expect(isCategoryAvailableAt('sabji', at('11:59'), { graceMin: CLOSING_GRACE_MIN })).toBe(false);
    });

    it('defaults to no grace, so the UI shows the strict schedule', () => {
        expect(isCategoryAvailableAt('paratha', at('15:05'))).toBe(false);
    });
});

describe('waitProgress', () => {
    it('is 0 at the start of the wait and nearly 1 at the opening', () => {
        expect(waitProgress('dosa', KITCHEN_OPEN_MIN)).toBe(0);
        expect(waitProgress('dosa', at('09:59'))).toBeCloseTo(1, 1);
    });

    it('is half way through the morning wait for dosa', () => {
        // 08:00 -> 10:00, so 09:00 is halfway.
        expect(waitProgress('dosa', at('09:00'))).toBeCloseTo(0.5, 5);
    });

    it('measures the evening paratha wait from when lunch service ended', () => {
        // 15:00 -> 19:00, so 17:00 is halfway - not measured from 08:00.
        expect(waitProgress('paratha', at('17:00'))).toBeCloseTo(0.5, 5);
    });

    it('is null when the item is already available or done for the day', () => {
        expect(waitProgress('dosa', at('12:00'))).toBeNull();
        expect(waitProgress('paratha', at('20:50'))).toBeNull();
    });
});

describe('formatIstMinute', () => {
    it('renders noon and midnight the way a student reads them', () => {
        expect(formatIstMinute(at('12:00'))).toBe('12:00 PM');
        expect(formatIstMinute(at('00:00'))).toBe('12:00 AM');
    });

    it('zero-pads minutes', () => {
        expect(formatIstMinute(at('19:05'))).toBe('7:05 PM');
    });
});

describe('schedule integrity', () => {
    it('covers every category in the menu grid', () => {
        // A new category with no window would otherwise be orderable all day.
        for (const { value } of MENU_CATEGORIES) {
            expect(CATEGORY_WINDOWS[value], `no window for ${value}`).toBeDefined();
        }
    });

    it('has no window outside the kitchen hours, and none inverted', () => {
        for (const [cat, windows] of Object.entries(CATEGORY_WINDOWS)) {
            for (const w of windows) {
                expect(w.startMin, `${cat} starts too early`).toBeGreaterThanOrEqual(KITCHEN_OPEN_MIN);
                expect(w.endMin, `${cat} ends too late`).toBeLessThanOrEqual(KITCHEN_CLOSE_MIN);
                expect(w.endMin, `${cat} window is inverted`).toBeGreaterThan(w.startMin);
            }
        }
    });

    it('keeps multi-window categories sorted and non-overlapping', () => {
        for (const [cat, windows] of Object.entries(CATEGORY_WINDOWS)) {
            for (let i = 1; i < windows.length; i++) {
                expect(windows[i].startMin, `${cat} windows overlap or are unsorted`)
                    .toBeGreaterThanOrEqual(windows[i - 1].endMin);
            }
        }
    });

    it('falls back to kitchen hours for an unknown category, not to always or never', () => {
        // A hand-edited or stale Firestore doc must not become orderable round the clock.
        expect(isCategoryAvailableAt('something_new', at('09:00'))).toBe(true);
        expect(isCategoryAvailableAt('something_new', at('07:00'))).toBe(false);
    });

    it('describes windows for an error message', () => {
        // En-dash: it is a range, and this string is shown to students.
        expect(describeWindows('paratha')).toBe('12:00 PM–3:00 PM and 7:00 PM–8:45 PM');
    });
});
