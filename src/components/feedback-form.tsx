"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { MAX_COMMENT_LENGTH, FEEDBACK_TAGS, type FeedbackTag } from "@/lib/feedback";

const RATING_LABELS = ["", "Bad", "Poor", "Okay", "Good", "Excellent"];

export function FeedbackForm({ onSubmitted }: { onSubmitted?: () => void }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [rating, setRating] = useState(0);
    const [hovered, setHovered] = useState(0);
    const [tag, setTag] = useState<FeedbackTag | null>(null);
    const [comment, setComment] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const canSubmit = !!user && rating >= 1 && tag !== null && comment.trim().length > 0;
    const shown = hovered || rating;

    const handleSubmit = async () => {
        if (!canSubmit || !user) return;

        setSubmitting(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch("/api/feedback", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ rating, tag, comment }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                toast({
                    title: "Couldn't send feedback",
                    description: data?.error ?? "Please try again.",
                    variant: "destructive",
                });
                return;
            }

            toast({ title: "Thanks for the feedback!" });
            setRating(0);
            setHovered(0);
            setTag(null);
            setComment("");
            onSubmitted?.();
        } catch {
            toast({
                title: "Couldn't send feedback",
                description: "Check your connection and try again.",
                variant: "destructive",
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((value) => (
                        <button
                            key={value}
                            type="button"
                            aria-label={`${value} star${value > 1 ? "s" : ""}`}
                            onClick={() => setRating(value)}
                            onMouseEnter={() => setHovered(value)}
                            onMouseLeave={() => setHovered(0)}
                            className="p-1 transition-transform hover:scale-110 active:scale-95"
                        >
                            <Star
                                className={cn(
                                    "w-8 h-8 transition-colors",
                                    value <= shown
                                        ? "fill-amber-400 text-amber-400"
                                        : "text-gray-300",
                                )}
                            />
                        </button>
                    ))}
                </div>
                <p className="text-xs font-semibold text-muted-foreground h-4">
                    {shown > 0 ? RATING_LABELS[shown] : "Tap to rate"}
                </p>
            </div>

            <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">
                    What's this about?
                </p>
                <div className="flex flex-wrap gap-2">
                    {FEEDBACK_TAGS.map(({ value, label }) => {
                        const selected = tag === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => setTag(value)}
                                className={cn(
                                    "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors active:scale-95",
                                    selected
                                        ? "bg-primary text-white border-primary"
                                        : "bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary",
                                )}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-1.5">
                <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
                    placeholder="Tell us more"
                    rows={3}
                    className="resize-none"
                />
                <p className="text-[10px] text-right text-muted-foreground">
                    {comment.length}/{MAX_COMMENT_LENGTH}
                </p>
            </div>

            <Button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="w-full bg-primary hover:bg-primary/90"
            >
                {submitting ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending…
                    </>
                ) : (
                    "Send"
                )}
            </Button>
        </div>
    );
}
