"use client";

import { useEffect, useRef } from 'react';
import { Order } from '@/types';

/**
 * Plays a pleasant 3-note ascending chime using the Web Audio API.
 * No audio file needed — generated via oscillator. Works on all modern browsers.
 * Exported so it can be called by the SW message listener too.
 */
export function playOrderChime() {
    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        // A4 → C#5 → E5 — ascending A-major chord, universally pleasant
        const notes = [440, 554, 659];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t = ctx.currentTime + i * 0.18;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
            osc.start(t);
            osc.stop(t + 0.45);
        });
        // Close context after chime finishes to free resources
        setTimeout(() => ctx.close().catch(() => {}), 1200);
    } catch {
        // Non-fatal — no sound is acceptable
    }
}

/**
 * Detects when ANY of this user's orders transitions to 'Ready'
 * and fires a chime + strong haptic vibration.
 * Skips the initial mount to avoid false alerts on page load.
 */
export function useOrderReadyAlert(orders: Order[], userId: string | undefined) {
    const prevStatusMap = useRef<Map<string, string>>(new Map());
    const initialized = useRef(false);

    useEffect(() => {
        if (!userId) return;

        const myOrders = orders.filter(o => o.studentId === userId);

        if (!initialized.current) {
            // Seed the map on first run — don't alert for existing statuses
            myOrders.forEach(o => prevStatusMap.current.set(o.id, o.status));
            initialized.current = true;
            return;
        }

        myOrders.forEach(order => {
            const prev = prevStatusMap.current.get(order.id);
            // Transition from any non-Ready state → Ready
            if (prev && prev !== 'Ready' && order.status === 'Ready') {
                playOrderChime();
                navigator.vibrate?.([200, 100, 200, 100, 200]);
            }
            prevStatusMap.current.set(order.id, order.status);
        });
    }, [orders, userId]);
}
