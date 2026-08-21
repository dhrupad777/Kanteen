"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format } from "date-fns";
import { Loader2, MessageSquare, Star, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { feedbackTagLabel } from "@/lib/feedback";
import type { Feedback } from "@/types";

const FEEDBACK_LIMIT = 100;

/**
 * Staff-facing list of student feedback, used by both /counter and /report.
 *
 * Reads the `feedback` collection directly from Firestore — allowed by the
 * claim-based isKitchenStaff() rule.
 */
export function FeedbackList() {
    const [feedback, setFeedback] = useState<Feedback[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(
            collection(db, "feedback"),
            orderBy("createdAt", "desc"),
            limit(FEEDBACK_LIMIT),
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const rows: Feedback[] = snapshot.docs.map((doc) => {
                const data = doc.data() as any;
                return {
                    id: doc.id,
                    studentId: data.studentId ?? "",
                    userName: data.userName ?? "",
                    userEmail: data.userEmail ?? "",
                    rating: typeof data.rating === "number" ? data.rating : 0,
                    tag: data.tag ?? "",
                    comment: data.comment ?? "",
                    // createdAt is null for a beat until the server timestamp lands.
                    createdAt: data.createdAt instanceof Timestamp
                        ? data.createdAt.toDate()
                        : new Date(),
                };
            });
            setFeedback(rows);
            setLoading(false);
        }, (error) => {
            console.error("FeedbackList snapshot error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (feedback.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <MessageSquare className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <h3 className="text-lg font-semibold text-gray-900">No Feedback Yet</h3>
                <p className="text-sm text-gray-500">
                    Feedback from students will appear here in real-time.
                </p>
            </div>
        );
    }

    const averageRating = feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length;

    return (
        <div className="space-y-4">
            {/* Summary bar */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-4">
                <Star className="h-4 w-4 text-amber-500 fill-amber-400 shrink-0" />
                <div className="flex items-center gap-3 text-sm flex-wrap">
                    <span className="font-semibold text-gray-900">
                        {feedback.length} {feedback.length === 1 ? "response" : "responses"}
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="font-bold text-amber-600">
                        {averageRating.toFixed(1)} average
                    </span>
                </div>
            </div>

            {feedback.map((item) => (
                <div
                    key={item.id}
                    className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm transition-all hover:shadow-md"
                >
                    <div className="flex justify-between items-center gap-3 mb-2 flex-wrap">
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((value) => (
                                    <Star
                                        key={value}
                                        className={cn(
                                            "h-4 w-4",
                                            value <= item.rating
                                                ? "fill-amber-400 text-amber-400"
                                                : "text-gray-200",
                                        )}
                                    />
                                ))}
                            </div>
                            {item.tag && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-orange-50 text-orange-700 border border-orange-200">
                                    {feedbackTagLabel(item.tag)}
                                </span>
                            )}
                        </div>
                        <span className="text-[11px] text-gray-400 whitespace-nowrap shrink-0">
                            {format(item.createdAt, "d MMM, h:mm a")}
                        </span>
                    </div>

                    {item.comment && (
                        <p className="text-sm text-gray-800 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 mb-2 break-words">
                            {item.comment}
                        </p>
                    )}

                    {/* Who left it */}
                    <div className="flex items-center gap-1.5 text-xs text-gray-600 border-t border-gray-100 pt-2">
                        <User className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="font-semibold truncate">
                            {item.userName || "Unknown"}
                        </span>
                        {item.userEmail && (
                            <>
                                <span className="text-gray-300">·</span>
                                <span className="truncate text-gray-500">{item.userEmail}</span>
                            </>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
