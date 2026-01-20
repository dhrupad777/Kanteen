"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Gavel, Trophy } from "lucide-react";
import { MootRegistrationForm } from "./MootRegistrationForm";
import { CompetitionsRegistrationForm } from "./CompetitionsRegistrationForm";

interface RegisterModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Step = "selection" | "moot" | "competitions" | "success";

export function RegisterModal({ isOpen, onClose }: RegisterModalProps) {
    const [step, setStep] = useState<Step>("selection");

    const handleClose = () => {
        setStep("selection");
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
                    onClick={handleClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-[#0a0a0a] border border-white/10 shadow-2xl flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 md:p-6 border-b border-white/5 bg-white/5 shrink-0">
                            <h2 className="text-lg md:text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-200 to-yellow-500">
                                {step === "selection" && "Select Event Category"}
                                {step === "moot" && "Moot Court Registration"}
                                {step === "competitions" && "Competitions Registration"}
                                {step === "success" && "Registration Complete"}
                            </h2>
                            <button
                                onClick={handleClose}
                                className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/70 hover:text-white"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar">

                            {/* STEP 1: SELECTION */}
                            {step === "selection" && (
                                <div className="grid md:grid-cols-2 gap-6 h-full min-h-[400px]">
                                    {/* Moot Court Card */}
                                    <button
                                        onClick={() => setStep("moot")}
                                        className="group relative flex flex-col items-center justify-center p-8 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-amber-500/50 transition-all duration-300 text-center space-y-4"
                                    >
                                        <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                            <Gavel className="w-10 h-10 text-amber-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-bold text-white mb-2">Moot Court</h3>
                                            <p className="text-white/60 text-sm max-w-xs mx-auto">
                                                Flagship event with a prize pool of ₹50,000+. Register your team now.
                                            </p>
                                        </div>
                                        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>

                                    {/* Competitions Card */}
                                    <button
                                        onClick={() => setStep("competitions")}
                                        className="group relative flex flex-col items-center justify-center p-8 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-blue-500/50 transition-all duration-300 text-center space-y-4"
                                    >
                                        <div className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                            <Trophy className="w-10 h-10 text-blue-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-bold text-white mb-2">Competitions</h3>
                                            <p className="text-white/60 text-sm max-w-xs mx-auto">
                                                Debate, CSI, Article Writing, and Paper Presentation.
                                            </p>
                                        </div>
                                        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                </div>
                            )}

                            {/* STEP 2: FORMS */}
                            {step === "moot" && (
                                <MootRegistrationForm
                                    onSuccess={() => setStep("success")}
                                    onCancel={() => setStep("selection")}
                                />
                            )}

                            {step === "competitions" && (
                                <CompetitionsRegistrationForm
                                    onSuccess={() => setStep("success")}
                                    onCancel={() => setStep("selection")}
                                />
                            )}

                            {/* STEP 3: SUCCESS */}
                            {step === "success" && (
                                <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-300">
                                    <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
                                        <Trophy className="w-12 h-12 text-green-500" />
                                    </div>
                                    <h3 className="text-3xl font-bold text-white mb-4">Registration Successful!</h3>
                                    <p className="text-white/60 max-w-md mb-8">
                                        Thank you for registering. We have recorded your details and uploaded your documents. You will receive further updates soon.
                                    </p>
                                    <button
                                        onClick={() => setStep("selection")}
                                        className="px-8 py-3 bg-white/10 border border-white/20 rounded-full text-white hover:bg-white/20 transition-all"
                                    >
                                        Register for Another Event
                                    </button>
                                </div>
                            )}

                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
