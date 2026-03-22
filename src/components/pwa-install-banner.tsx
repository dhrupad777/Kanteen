"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Share } from "lucide-react";

const SNOOZE_KEY = 'kanteen_install_snoozed';
const SNOOZE_DAYS = 14;

interface PwaInstallBannerProps {
    isInstallable: boolean;       // Android/Desktop: browser deferred prompt available
    isInstalled: boolean;         // Already a PWA — hide everything
    iosNeedsInstall: boolean;     // iOS Safari: needs manual Add to Home Screen
    installApp: () => Promise<void>;
}

export function PwaInstallBanner({ isInstallable, isInstalled, iosNeedsInstall, installApp }: PwaInstallBannerProps) {
    const [visible, setVisible] = useState(false);
    const [installing, setInstalling] = useState(false);

    const shouldShow = !isInstalled && (isInstallable || iosNeedsInstall);

    useEffect(() => {
        if (!shouldShow) return;

        // Check snooze
        const snoozed = localStorage.getItem(SNOOZE_KEY);
        if (snoozed && Date.now() < Number(snoozed)) return;

        // Show after 4 seconds — feel natural, not jarring
        const t = setTimeout(() => setVisible(true), 4000);
        return () => clearTimeout(t);
    }, [shouldShow]);

    const dismiss = () => {
        localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
        setVisible(false);
    };

    const handleInstall = async () => {
        setInstalling(true);
        await installApp();
        setInstalling(false);
        setVisible(false);
    };

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ y: 120, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 120, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 340, damping: 30 }}
                    className="fixed bottom-4 left-4 right-4 z-50 max-w-sm mx-auto"
                >
                    <div className="bg-white rounded-2xl shadow-2xl shadow-black/15 border border-gray-100 overflow-hidden">
                        {/* Orange accent line */}
                        <div className="h-1 bg-gradient-to-r from-orange-400 to-orange-600" />

                        <div className="p-4">
                            <div className="flex items-start gap-3">
                                {/* App icon */}
                                <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center shrink-0 overflow-hidden">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src="/icons/android-chrome-192x192.png"
                                        alt="Kanteen"
                                        className="w-10 h-10 object-contain"
                                    />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-900 text-sm leading-tight">
                                        Install Kanteen
                                    </p>
                                    {isInstallable ? (
                                        <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                                            Open instantly, even offline. No app store needed.
                                        </p>
                                    ) : (
                                        // iOS guide
                                        <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                                            Add to Home Screen for the best experience.
                                        </p>
                                    )}
                                </div>

                                <button
                                    onClick={dismiss}
                                    className="p-1 text-gray-300 hover:text-gray-500 transition-colors shrink-0"
                                    aria-label="Dismiss"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Action area */}
                            <div className="mt-3">
                                {isInstallable ? (
                                    // Android / Desktop: native install button
                                    <button
                                        onClick={handleInstall}
                                        disabled={installing}
                                        className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-[0.98] disabled:opacity-60 text-white rounded-xl py-2.5 text-sm font-semibold transition-all"
                                    >
                                        <Download className="w-4 h-4" />
                                        {installing ? 'Installing…' : 'Add to Home Screen'}
                                    </button>
                                ) : (
                                    // iOS: manual steps
                                    <div className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-1.5">
                                        <div className="flex items-center gap-2 text-xs text-gray-700">
                                            <Share className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                            <span>Tap the <span className="font-semibold">Share</span> button in Safari</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-gray-700">
                                            <span className="w-3.5 h-3.5 flex items-center justify-center text-[10px] text-gray-400 shrink-0">＋</span>
                                            <span>Tap <span className="font-semibold">Add to Home Screen</span></span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
