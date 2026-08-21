"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MessageSquare } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { FeedbackForm } from "@/components/feedback-form";

/**
 * "Send feedback" — a small icon button for the student dashboard header,
 * next to the notification bell.
 *
 * General feedback: not tied to an order, available any time the student is
 * signed in. Renders nothing when signed out, since the API requires a token.
 */
export function FeedbackButton() {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);

    if (!user) return null;

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                title="Send us feedback"
                aria-label="Send us feedback"
                className="p-2 rounded-full text-gray-400 transition-all active:scale-95 hover:text-orange-500 hover:bg-orange-50"
            >
                <MessageSquare className="w-5 h-5" />
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Send us feedback</DialogTitle>
                        <DialogDescription>
                            Tell us how we're doing — anything at all.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <FeedbackForm onSubmitted={() => setOpen(false)} />
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
