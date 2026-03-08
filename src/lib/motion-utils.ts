/**
 * Framer Motion Utilities & Presets
 * Shared animation configurations for consistent, premium feel across Kanteen
 */

import { type Transition, type Variants } from "framer-motion";

// =============================================================================
// SPRING PRESETS - Natural, premium physics
// =============================================================================

export const springs = {
    /** Quick, snappy feedback for buttons and taps */
    snappy: { type: "spring", stiffness: 400, damping: 17 } as Transition,

    /** Bouncy, playful animations for celebrations */
    bouncy: { type: "spring", stiffness: 300, damping: 10 } as Transition,

    /** Gentle, elegant transitions for modals and pages */
    gentle: { type: "spring", stiffness: 200, damping: 20 } as Transition,

    /** Soft, subtle movements for hover states */
    soft: { type: "spring", stiffness: 150, damping: 25 } as Transition,

    /** Premium modal feel (Phantom Wallet style) */
    modal: { type: "spring", stiffness: 300, damping: 30 } as Transition,
} as const;

// =============================================================================
// TAP/HOVER PRESETS - Micro-interactions
// =============================================================================

export const interactions = {
    /** Duolingo-style button tap */
    tap: {
        whileTap: { scale: 0.95 },
        whileHover: { scale: 1.02 },
        transition: springs.snappy,
    },

    /** Subtle card hover */
    cardHover: {
        whileHover: { y: -4, transition: springs.soft },
    },

    /** Glowing button effect */
    glow: {
        whileHover: {
            boxShadow: "0 0 20px rgba(249, 115, 22, 0.4)",
            transition: { duration: 0.2 },
        },
    },
} as const;

// =============================================================================
// STAGGER VARIANTS - List animations
// =============================================================================

export const staggerContainer: Variants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05,
            delayChildren: 0.1,
        },
    },
};

export const staggerItem: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: {
        opacity: 1,
        y: 0,
        transition: springs.gentle,
    },
};

export const staggerItemScale: Variants = {
    hidden: { opacity: 0, scale: 0.8 },
    show: {
        opacity: 1,
        scale: 1,
        transition: springs.bouncy,
    },
};

// =============================================================================
// CELEBRATION VARIANTS - Success states
// =============================================================================

export const celebrateScale: Variants = {
    initial: { scale: 0, opacity: 0, rotate: -10 },
    animate: {
        scale: 1,
        opacity: 1,
        rotate: 0,
        transition: springs.bouncy,
    },
};

export const pulseSuccess: Variants = {
    initial: { scale: 1 },
    animate: {
        scale: [1, 1.2, 1],
        backgroundColor: ["var(--bg)", "#4ade80", "var(--bg)"],
        transition: { duration: 0.4 },
    },
};

export const revealUp: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            ...springs.bouncy,
            delay: 0.2,
        },
    },
};

export const revealScale: Variants = {
    hidden: { opacity: 0, scale: 0.5 },
    visible: {
        opacity: 1,
        scale: 1,
        transition: springs.bouncy,
    },
};

// =============================================================================
// NUMBER ANIMATION - Slot machine effect
// =============================================================================

export const numberRoll: Variants = {
    initial: { y: 20, opacity: 0 },
    animate: {
        y: 0,
        opacity: 1,
        transition: {
            type: "spring",
            stiffness: 500,
            damping: 25,
        },
    },
    exit: {
        y: -20,
        opacity: 0,
        transition: { duration: 0.15 },
    },
};

// =============================================================================
// MODAL VARIANTS - Premium feel
// =============================================================================

export const modalOverlay: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.2 } },
    exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const modalContent: Variants = {
    hidden: {
        opacity: 0,
        scale: 0.95,
        y: 10,
    },
    visible: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: springs.modal,
    },
    exit: {
        opacity: 0,
        scale: 0.95,
        y: 10,
        transition: { duration: 0.15 },
    },
};

// =============================================================================
// PAGE TRANSITIONS
// =============================================================================

export const pageTransition: Variants = {
    initial: { opacity: 0, x: 20 },
    animate: {
        opacity: 1,
        x: 0,
        transition: springs.gentle,
    },
    exit: {
        opacity: 0,
        x: -20,
        transition: { duration: 0.15 },
    },
};

export const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: springs.gentle,
    },
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create a delayed stagger container
 * @param staggerDelay - Delay between each child (default: 0.05)
 * @param initialDelay - Delay before first child (default: 0)
 */
export function createStaggerContainer(
    staggerDelay = 0.05,
    initialDelay = 0
): Variants {
    return {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: staggerDelay,
                delayChildren: initialDelay,
            },
        },
    };
}

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Get animation props respecting reduced motion preference
 */
export function getMotionProps<T extends object>(props: T): T | Record<string, never> {
    if (prefersReducedMotion()) return {};
    return props;
}
