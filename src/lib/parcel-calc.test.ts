import { describe, it, expect } from 'vitest';
import { calculateParcelCharge } from './parcel-calc';

describe('calculateParcelCharge', () => {
    it('charges container items ₹5 each', () => {
        const r = calculateParcelCharge([
            { category: 'chinese', qty: 2, wantParcel: true },
            { category: 'sabji', qty: 1, wantParcel: true },
        ]);
        expect(r.containerParcel).toBe(15);
        expect(r.totalParcelCharge).toBe(15);
    });

    it('does not charge a container item that is not parcelled', () => {
        const r = calculateParcelCharge([{ category: 'chinese', qty: 2, wantParcel: false }]);
        expect(r.totalParcelCharge).toBe(0);
        expect(r.isParcel).toBe(false);
    });

    it('charges one flat ₹5 for any quantity of bag items', () => {
        const r = calculateParcelCharge([{ category: 'dosa', qty: 3, wantParcel: true }]);
        expect(r.bagParcel).toBe(5);
    });

    it('charges one flat ₹5 across several bag categories', () => {
        const r = calculateParcelCharge([
            { category: 'dosa', qty: 3, wantParcel: true },
            { category: 'sandwich', qty: 2, wantParcel: true },
            { category: 'paratha', qty: 1, wantParcel: true },
        ]);
        expect(r.bagParcel).toBe(5);
        expect(r.totalParcelCharge).toBe(5);
    });

    it('adds the bag charge on top of container charges', () => {
        const r = calculateParcelCharge([
            { category: 'dosa', qty: 2, wantParcel: true },
            { category: 'chinese', qty: 2, wantParcel: true },
        ]);
        expect(r.totalParcelCharge).toBe(15);
    });

    it('keeps Main Course at a flat ₹5 and extras free alongside it', () => {
        const r = calculateParcelCharge([
            { category: 'daily_menu', qty: 3, wantParcel: true },
            { category: 'daily_regulars', qty: 2, wantParcel: true },
        ]);
        expect(r.totalParcelCharge).toBe(5);
    });
});
