"use client";

import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function AboutPage() {
    return (
        <main className="min-h-screen bg-black text-white p-4 md:p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <Link href="/" className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/70 hover:text-white">
                        <ArrowLeft size={24} />
                    </Link>
                    <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-200 to-yellow-500">
                        About Us
                    </h1>
                </div>

                {/* Content */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-6 md:p-8 rounded-2xl bg-[#0a0a0a] border border-white/10 space-y-6 text-lg text-white/80 leading-relaxed shadow-2xl"
                >
                    <p>
                        <span className="font-semibold text-amber-500">Amity Law School, Maharashtra</span>, proudly presents{" "}
                        <span className="font-bold text-white">Vidhi Dharmotsav 2.0</span>, a distinguished three-day National Legal
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
                </motion.div>
            </div>
        </main>
    );
}
