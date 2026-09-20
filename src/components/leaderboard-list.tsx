"use client";

import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import { cn } from "@/lib/utils";
import type { LeaderboardEntry } from "@/types";

/**
 * The ranked rows of the monthly leaderboard — names and ranks only, never
 * amounts (see /api/leaderboard, which withholds them from the student payload).
 *
 * Chrome-free on purpose: it's rendered inside the leaderboard dialog, which
 * supplies its own header.
 */

const MEDALS = ['🥇', '🥈', '🥉'];

function Row({ entry }: { entry: LeaderboardEntry }) {
    return (
        <div className={cn("flex items-center gap-3 px-4 py-2.5", entry.isYou && "bg-orange-50")}>
            <span className={cn(
                "w-7 shrink-0 text-center text-sm font-black tabular-nums",
                entry.rank <= 3 ? "text-base" : "text-muted-foreground",
            )}>
                {MEDALS[entry.rank - 1] ?? entry.rank}
            </span>

            <Avatar className="h-8 w-8 shrink-0">
                {entry.photoURL && <AvatarImage src={entry.photoURL} alt="" />}
                <AvatarFallback className="bg-orange-100 text-xs font-bold text-orange-700">
                    {entry.displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
            </Avatar>

            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {entry.displayName}
            </span>

            {entry.isYou && (
                <Badge className="shrink-0 bg-orange-500 text-[10px] font-black uppercase tracking-wider hover:bg-orange-500">
                    You
                </Badge>
            )}
        </div>
    );
}

/** The signed-in student's own standing, pinned above the board so they never
 *  have to hunt for it — shown whether or not they made the top 10, and whether
 *  or not they have ordered. The null branch is a fallback for a student with no
 *  users/{uid} profile; everyone on the roster is ranked. */
function YourRank({ entry, totalRanked }: { entry: LeaderboardEntry | null; totalRanked: number }) {
    return (
        <div className="flex items-center gap-3 border-b border-orange-100 bg-orange-50/70 px-4 py-3">
            <div className="w-7 shrink-0 text-center">
                {entry
                    ? <span className="text-lg font-black leading-none tabular-nums text-orange-600">
                        {MEDALS[entry.rank - 1] ?? `#${entry.rank}`}
                      </span>
                    : <span className="text-lg leading-none">🍽️</span>
                }
            </div>

            <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-500">
                    Your rank
                </p>
                <p className="truncate text-sm font-bold">
                    {entry
                        ? `${entry.displayName} · #${entry.rank}`
                        : 'Not ranked yet — order something to join the board'}
                </p>
            </div>

            {entry && totalRanked > 0 && (
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                    of {totalRanked}
                </span>
            )}

            {entry?.photoURL && (
                <Avatar className="h-8 w-8 shrink-0 ring-2 ring-orange-300">
                    <AvatarImage src={entry.photoURL} alt="" />
                    <AvatarFallback className="bg-orange-100 text-xs font-bold text-orange-700">
                        {entry.displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
            )}
        </div>
    );
}

export function LeaderboardList() {
    const { user, loading: authLoading } = useAuth();
    const { data, loading, error } = useLeaderboard();

    if (!authLoading && !user) {
        return (
            <div className="flex items-center gap-3 p-5">
                <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                    Sign in to see this month&apos;s leaderboard.
                </p>
            </div>
        );
    }

    if (error) {
        return (
            <p className="p-5 text-sm text-muted-foreground">
                Couldn&apos;t load the leaderboard. Please try again.
            </p>
        );
    }

    if (authLoading || loading || !data) {
        return (
            <div className="space-y-3 p-4">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-4 w-5 shrink-0" />
                        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                        <Skeleton className="h-4 flex-1" />
                    </div>
                ))}
            </div>
        );
    }

    if (data.entries.length === 0) {
        return (
            <p className="p-5 text-sm text-muted-foreground">
                No orders yet this month. Be the first!
            </p>
        );
    }

    return (
        <>
            {/* Outside the scroll area on purpose — your own rank stays put while
                you scroll the board. */}
            <YourRank entry={data.you} totalRanked={data.totalRanked} />

            <div className="max-h-[55vh] divide-y divide-orange-50 overflow-y-auto">
                {data.entries.map((entry, i) => (
                    <motion.div
                        key={entry.rank}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04, duration: 0.2 }}
                    >
                        <Row entry={entry} />
                    </motion.div>
                ))}
            </div>
        </>
    );
}
