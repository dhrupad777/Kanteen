"use client";

import { useEffect, useRef } from 'react';
import type { Order } from '@/types';

/** Online (Razorpay-paid) orders carry tokens 201–999; counter orders are lower. */
const ONLINE_TOKEN_MIN = 201;

/**
 * Returns the Preparing online orders that are not in `seen`, and adds them to it.
 * Pure on purpose, so "which orders count as new" is testable without a browser.
 */
export function takeNewPreparingOrders(orders: Order[], seen: Set<string>): Order[] {
    const fresh = orders.filter(
        o => o.status === 'Preparing' && o.token && o.token >= ONLINE_TOKEN_MIN && !seen.has(o.id),
    );
    fresh.forEach(o => seen.add(o.id));
    return fresh;
}

// One AudioContext for the page. Browsers keep a context suspended until the user has
// interacted with the page, and a context created fresh inside a Firestore callback
// never gets that chance — so this one is created and resumed on the first tap/key.
let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return null;
        if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new AudioCtx();
        return sharedCtx;
    } catch {
        return null;
    }
}

/**
 * Kitchen "new order" chime: the same ascending-chord idea as the student's
 * order-ready chime (use-order-ready-alert.ts), a little higher and louder, and played
 * twice so it cuts through a busy kitchen. Generated with Web Audio — no audio file.
 */
export async function playNewOrderChime() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state !== 'running') await ctx.resume().catch(() => {});
        // Still blocked (nobody has touched the page yet): skip rather than queue a
        // stale chime that would fire on the next tap. The toast still shows.
        if (ctx.state !== 'running') return;

        // C5 → E5 → G5 → C6
        const notes = [523, 659, 784, 1047];
        [0, 0.9].forEach(offset => {
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.value = freq;
                const t = ctx.currentTime + offset + i * 0.16;
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(0.4, t + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
                osc.start(t);
                osc.stop(t + 0.5);
            });
        });
    } catch {
        // Non-fatal — no sound is acceptable
    }
}

/**
 * Chimes (and vibrates, where supported) whenever a new online order reaches Preparing,
 * regardless of whether a printer is connected. Skips the orders already present when
 * the page first loads. `onNewOrders` lets the caller show its own toast.
 */
export function useNewOrderAlert(
    orders: Order[],
    loading: boolean,
    onNewOrders?: (newOrders: Order[]) => void,
) {
    const seen = useRef<Set<string>>(new Set());
    const initialized = useRef(false);
    const onNewOrdersRef = useRef(onNewOrders);
    useEffect(() => { onNewOrdersRef.current = onNewOrders; }, [onNewOrders]);

    // Unlock audio on the first interaction so a later chime is allowed to play.
    useEffect(() => {
        const events = ['pointerdown', 'keydown', 'touchstart'] as const;
        const unlock = () => {
            getAudioContext()?.resume().catch(() => {});
            events.forEach(e => window.removeEventListener(e, unlock));
        };
        events.forEach(e => window.addEventListener(e, unlock));
        return () => events.forEach(e => window.removeEventListener(e, unlock));
    }, []);

    useEffect(() => {
        if (loading) return;
        const fresh = takeNewPreparingOrders(orders, seen.current);
        if (!initialized.current) {
            initialized.current = true; // orders already there on page load — don't alert
            return;
        }
        if (fresh.length === 0) return;
        void playNewOrderChime();
        navigator.vibrate?.([200, 100, 200]);
        onNewOrdersRef.current?.(fresh);
    }, [orders, loading]);
}
