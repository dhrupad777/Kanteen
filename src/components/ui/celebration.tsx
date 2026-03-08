"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface Particle {
    id: number;
    x: number;
    y: number;
    color: string;
}

interface CelebrationProps {
    /** Whether to show the celebration */
    show: boolean;
    /** Callback when animation completes */
    onComplete?: () => void;
    /** Number of particles (default: 12) */
    particleCount?: number;
    /** Colors for particles */
    colors?: string[];
    /** Duration in ms (default: 800) */
    duration?: number;
}

const defaultColors = ["#f97316", "#fbbf24", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899"];

/**
 * Celebration component with confetti/particle explosion
 * 
 * @example
 * ```tsx
 * const [showCelebration, setShowCelebration] = useState(false);
 * 
 * <button onClick={() => setShowCelebration(true)}>
 *   Celebrate!
 * </button>
 * <Celebration show={showCelebration} onComplete={() => setShowCelebration(false)} />
 * ```
 */
export function Celebration({
    show,
    onComplete,
    particleCount = 12,
    colors = defaultColors,
    duration = 800,
}: CelebrationProps) {
    const [particles, setParticles] = useState<Particle[]>([]);

    useEffect(() => {
        if (show) {
            // Generate particles
            const newParticles: Particle[] = Array.from({ length: particleCount }, (_, i) => ({
                id: i,
                x: (Math.random() - 0.5) * 200, // Random spread
                y: -(Math.random() * 100 + 50), // Upward motion
                color: colors[Math.floor(Math.random() * colors.length)],
            }));
            setParticles(newParticles);

            // Clear after animation
            const timer = setTimeout(() => {
                setParticles([]);
                onComplete?.();
            }, duration);

            return () => clearTimeout(timer);
        }
    }, [show, particleCount, colors, duration, onComplete]);

    if (particles.length === 0) return null;

    return (
        <div
            className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
            aria-hidden="true"
        >
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                {particles.map((particle) => (
                    <div
                        key={particle.id}
                        className="absolute h-3 w-3 rounded-full animate-confetti"
                        style={{
                            backgroundColor: particle.color,
                            left: 0,
                            top: 0,
                            transform: `translate(${particle.x}px, ${particle.y}px)`,
                            animationDuration: `${duration}ms`,
                            animationDelay: `${Math.random() * 100}ms`,
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * Hook to trigger celebrations imperatively
 */
export function useCelebration() {
    const [isActive, setIsActive] = useState(false);

    const trigger = useCallback(() => {
        setIsActive(true);
    }, []);

    const reset = useCallback(() => {
        setIsActive(false);
    }, []);

    return {
        isActive,
        trigger,
        reset,
        CelebrationComponent: () => (
            <Celebration show={isActive} onComplete={reset} />
        ),
    };
}

/**
 * Particle burst effect for buttons/elements
 * Renders particles at a specific position
 */
interface ParticleBurstProps {
    /** Whether to show the burst */
    show: boolean;
    /** Position relative to parent */
    position?: { x: number; y: number };
    /** Callback when complete */
    onComplete?: () => void;
}

export function ParticleBurst({ show, position = { x: 0, y: 0 }, onComplete }: ParticleBurstProps) {
    const [active, setActive] = useState(false);

    useEffect(() => {
        if (show && !active) {
            setActive(true);
            const timer = setTimeout(() => {
                setActive(false);
                onComplete?.();
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [show, active, onComplete]);

    if (!active) return null;

    return (
        <div
            className="pointer-events-none absolute"
            style={{ left: position.x, top: position.y }}
            aria-hidden="true"
        >
            <div className="particle particle-1" style={{ left: 0, top: 0 }} />
            <div className="particle particle-2" style={{ left: 0, top: 0 }} />
            <div className="particle particle-3" style={{ left: 0, top: 0 }} />
            <div className="particle particle-4" style={{ left: 0, top: 0 }} />
        </div>
    );
}

/**
 * Success checkmark animation component
 */
interface SuccessCheckProps {
    show: boolean;
    size?: "sm" | "md" | "lg";
}

export function SuccessCheck({ show, size = "md" }: SuccessCheckProps) {
    if (!show) return null;

    const sizeClasses = {
        sm: "h-8 w-8",
        md: "h-16 w-16",
        lg: "h-24 w-24",
    };

    return (
        <div className={`${sizeClasses[size]} animate-bounce-in`}>
            <svg
                viewBox="0 0 52 52"
                className="h-full w-full"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <circle
                    cx="26"
                    cy="26"
                    r="24"
                    className="fill-green-500"
                />
                <path
                    d="M14 27L22 35L38 19"
                    className="stroke-white"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                        strokeDasharray: 50,
                        strokeDashoffset: 50,
                        animation: "check-draw 0.4s ease-out 0.3s forwards",
                    }}
                />
            </svg>
            <style jsx>{`
        @keyframes check-draw {
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
        </div>
    );
}
