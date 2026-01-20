"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Gavel, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
    const router = useRouter();

    return (
        <main className="min-h-screen bg-black text-white p-4 md:p-8 flex items-center justify-center">
            <div className="w-full max-w-4xl space-y-8">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <Link href="/" className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/70 hover:text-white">
                        <ArrowLeft size={24} />
                    </Link>
                    <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-200 to-yellow-500">
                        Registration
                    </h1>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid md:grid-cols-2 gap-6"
                >
                    {/* Moot Court Card */}
                    <button
                        onClick={() => router.push("/register/moot")}
                        className="group relative flex flex-col items-center justify-center p-8 md:p-12 rounded-2xl border border-white/10 bg-[#0a0a0a] hover:bg-white/5 hover:border-amber-500/50 transition-all duration-300 text-center space-y-6"
                    >
                        <div className="w-24 h-24 rounded-full bg-amber-500/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                            <Gavel className="w-12 h-12 text-amber-400" />
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
                        onClick={() => router.push("/register/competition")}
                        className="group relative flex flex-col items-center justify-center p-8 md:p-12 rounded-2xl border border-white/10 bg-[#0a0a0a] hover:bg-white/5 hover:border-blue-500/50 transition-all duration-300 text-center space-y-6"
                    >
                        <div className="w-24 h-24 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                            <Trophy className="w-12 h-12 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold text-white mb-2">Competitions</h3>
                            <p className="text-white/60 text-sm max-w-xs mx-auto">
                                Debate, CSI, Article Writing, and Paper Presentation.
                            </p>
                        </div>
                        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                </motion.div>
            </div>
        </main>
    );
}
