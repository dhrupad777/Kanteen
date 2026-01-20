"use client";

import { Trophy } from "lucide-react";
import Link from "next/link";

export default function SuccessPage() {
    return (
        <main className="min-h-screen bg-black text-white flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 text-center space-y-6">
                <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                    <Trophy className="w-12 h-12 text-green-500" />
                </div>
                <h1 className="text-3xl font-bold text-white">Registration Successful!</h1>
                <p className="text-white/60">
                    Thank you for registering. We have recorded your details and uploaded your documents. You will receive further updates soon.
                </p>
                <div className="pt-4">
                    <Link
                        href="/"
                        className="inline-block px-8 py-3 bg-white/10 border border-white/20 rounded-full text-white hover:bg-white/20 transition-all font-medium"
                    >
                        Return Home
                    </Link>
                </div>
            </div>
        </main>
    );
}
