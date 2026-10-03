"use client";

import { useEffect, useState } from "react";
import { istMinutesOfDay } from "@/lib/menu-availability";

/**
 * Current minute-of-day in IST, re-rendering once a minute.
 *
 * Menu availability turns over on wall-clock boundaries (10:00, 12:00, 15:00), so a
 * student sitting on the order page when a window opens should see it unlock without
 * reloading. One shared ticker rather than a timer per card: the order page can render
 * dozens of cards, and dozens of intervals firing on their own offsets would both waste
 * work and let cards disagree about what time it is mid-render.
 *
 * Aligned to the next real minute boundary instead of now+60s, so the unlock lands when
 * the clock actually ticks over rather than up to a minute late.
 */
export function useIstMinute(): number {
    const [minute, setMinute] = useState(() => istMinutesOfDay());

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout>;

        const scheduleNextTick = () => {
            const now = new Date();
            const msToNextMinute = 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
            timeoutId = setTimeout(() => {
                setMinute(istMinutesOfDay());
                scheduleNextTick();
            }, msToNextMinute + 50); // small cushion so we land just past the boundary
        };

        // Re-sync immediately on mount: a phone that was asleep can return with a stale
        // value, and the student is most likely looking at the page right then.
        setMinute(istMinutesOfDay());
        scheduleNextTick();

        const resync = () => {
            if (document.visibilityState === "visible") setMinute(istMinutesOfDay());
        };
        document.addEventListener("visibilitychange", resync);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener("visibilitychange", resync);
        };
    }, []);

    return minute;
}
