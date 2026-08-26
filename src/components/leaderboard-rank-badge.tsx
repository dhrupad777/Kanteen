"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Trophy } from "lucide-react";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { LeaderboardList } from "@/components/leaderboard-list";
import { useAuth } from "@/hooks/use-auth";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import { cn } from "@/lib/utils";

/**
 * Leaderboard button for the student dashboard header, beside the feedback icon.
 *
 * Shows the student's own rank when they have one ("🥇" / "#12"), and opens the
 * full leaderboard in a dialog. Same shape as FeedbackButton: renders nothing
 * signed out, since /api/leaderboard requires a token.
 *
 * It renders even when the student has no rank yet — this is the only entry
 * point to the leaderboard, so hiding it would lock out anyone who hasn't
 * ordered this month.
 */

const MEDALS = ['🥇', '🥈', '🥉'];

export function LeaderboardRankBadge() {
    const { user } = useAuth();
    const { data } = useLeaderboard();
    const [open, setOpen] = useState(false);

    if (!user) return null;

    // `you` is populated only when the student placed outside the visible top N.
    const rank = data?.you?.rank ?? data?.entries.find((e) => e.isYou)?.rank;
    const medal = rank ? MEDALS[rank - 1] : undefined;

    const label = rank
        ? `You're #${rank} this month — tap to see the leaderboard`
        : 'See this month\'s leaderboard';

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                title={label}
                aria-label={label}
                className={cn(
                    "flex items-center gap-1 rounded-full py-2 transition-all active:scale-95",
                    rank ? "pl-2 pr-2.5" : "px-2",
                    medal
                        ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                        : "text-gray-400 hover:bg-orange-50 hover:text-orange-500",
                )}
            >
                {medal
                    ? <span className="text-sm leading-none">{medal}</span>
                    : <Trophy className="h-5 w-5" />
                }
                {rank && <span className="text-xs font-black tabular-nums">#{rank}</span>}
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-md gap-0 overflow-hidden p-0 [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:opacity-100">
                    <DialogHeader className="relative overflow-hidden bg-gradient-to-br from-orange-400 via-orange-500 to-red-600 px-5 py-4 text-left">
                        {/* Decorative blobs — same treatment as the Order Online CTA */}
                        <div className="pointer-events-none absolute -right-4 -top-6 h-24 w-24 rounded-full bg-white/10 blur-xl" />
                        <div className="pointer-events-none absolute -bottom-8 -left-4 h-28 w-28 rounded-full bg-orange-300/20 blur-2xl" />

                        <div className="relative flex items-center gap-2.5">
                            <Trophy className="h-5 w-5 shrink-0 text-white" />
                            <div className="min-w-0">
                                <DialogTitle className="truncate text-lg font-black tracking-tight text-white">
                                    Top Spenders
                                </DialogTitle>
                                <DialogDescription className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-100">
                                    {format(
                                        data?.month ? new Date(`${data.month}-01T00:00:00`) : new Date(),
                                        'MMMM',
                                    )}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <LeaderboardList />
                </DialogContent>
            </Dialog>
        </>
    );
}
