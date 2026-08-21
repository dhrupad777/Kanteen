"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Blast-radius limiter for a single rendered record.
 *
 * The app-level error boundary (src/app/error.tsx) replaces the *entire* page,
 * so one malformed Firestore document used to blank out every dashboard for
 * every user. Firestore is schemaless and orders are written by several
 * different paths, so we cannot assume every document is well-formed.
 *
 * Wrapping each card means a bad record degrades to one placeholder tile that
 * staff can still act on, instead of taking the page down. Normalizing data
 * (src/lib/order-normalize.ts) prevents the known cause; this catches the
 * unknown ones.
 */
interface Props {
    children: React.ReactNode;
    /** Shown in the fallback so staff can identify the offending order. */
    label?: string;
}

interface State {
    hasError: boolean;
}

export class OrderErrorBoundary extends React.Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        // Keep the detail in the console so the bad record is diagnosable.
        console.error(`Failed to render order ${this.props.label ?? ""}:`, error, info);
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
                <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-amber-600" />
                <p className="text-sm font-bold text-amber-900">
                    {this.props.label ? `Order ${this.props.label}` : "This order"} could not be displayed
                </p>
                <p className="mt-1 text-xs text-amber-700">
                    Its saved data is incomplete. Other orders are unaffected.
                </p>
            </div>
        );
    }
}
