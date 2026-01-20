"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-[#0a0a0a] border border-white/10 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 md:p-6 border-b border-white/5 bg-white/5">
                            <h2 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-200 to-yellow-500">About Us</h2>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/70 hover:text-white"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-4 md:p-8 space-y-4 text-white/80 leading-relaxed overflow-y-auto max-h-[70vh]">
                            <p>
                                <span className="font-semibold text-amber-500">Amity Law School, Maharashtra</span>, proudly presents{" "}
                                <span className="font-bold text-white">Vidhi Dharmotsav</span>, a distinguished three-day National Legal
                                Festival that celebrates the confluence of some of the most promising legal minds from across the
                                country.
                            </p>
                            <p>
                                This grand event, hosted by Amity University, Maharashtra, is a platform for law students from various
                                prestigious institutions to come together and engage in a dynamic exploration of the legal domain.
                            </p>
                            <p>
                                Vidhi Dharmotsav features an impressive lineup of nine meticulously curated events, each tailored to
                                challenge and enhance participants&apos; legal knowledge, analytical thinking, and practical application
                                of the law. These events are designed not only to test the students&apos; academic and professional acumen
                                but also to provide invaluable opportunities for intellectual growth and collaborative learning.
                            </p>
                            <p>
                                Over the course of three enriching days, participants will engage in stimulating discussions and debates
                                on critical themes such as law, justice, morality, and the intricate nuances of legal practice. This
                                festival serves as a unique platform for fostering dialogue, innovation, and a deeper understanding of
                                the ever-evolving landscape of law, aiming to inspire and prepare the next generation of legal
                                professionals.
                            </p>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
