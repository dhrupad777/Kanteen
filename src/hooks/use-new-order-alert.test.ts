import { describe, it, expect } from 'vitest';
import { takeNewPreparingOrders } from './use-new-order-alert';
import type { Order } from '@/types';

const order = (id: string, status: Order['status'], token: number): Order =>
    ({ id, status, token }) as Order;

describe('takeNewPreparingOrders', () => {
    it('returns Preparing online orders not seen before and marks them seen', () => {
        const seen = new Set<string>();
        const fresh = takeNewPreparingOrders([order('a', 'Preparing', 250)], seen);
        expect(fresh.map(o => o.id)).toEqual(['a']);
        expect(seen.has('a')).toBe(true);
    });

    it('does not return the same order twice', () => {
        const seen = new Set<string>();
        const orders = [order('a', 'Preparing', 250)];
        takeNewPreparingOrders(orders, seen);
        expect(takeNewPreparingOrders(orders, seen)).toEqual([]);
    });

    it('ignores counter orders (token below 201)', () => {
        expect(takeNewPreparingOrders([order('a', 'Preparing', 50)], new Set())).toEqual([]);
    });

    it('ignores orders that are not Preparing', () => {
        const orders = [order('a', 'Ready', 250), order('b', 'pending', 251), order('c', 'Completed', 252)];
        expect(takeNewPreparingOrders(orders, new Set())).toEqual([]);
    });

    it('returns only the new orders when some were already seen', () => {
        const seen = new Set(['a']);
        const fresh = takeNewPreparingOrders(
            [order('a', 'Preparing', 250), order('b', 'Preparing', 251)],
            seen,
        );
        expect(fresh.map(o => o.id)).toEqual(['b']);
    });
});
