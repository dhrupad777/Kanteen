"use client";

import { CompetitionsRegistrationForm } from "@/components/CompetitionsRegistrationForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function CompetitionRegisterPage() {
    const router = useRouter();

    return (
        <main className="min-h-screen bg-black text-white p-4 md:p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <Link href="/register" className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/70 hover:text-white">
                        <ArrowLeft size={24} />
                    </Link>
                    <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-200 to-blue-400">
                        Competitions Registration
                    </h1>
                </div>

                <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 md:p-8">
                    <CompetitionsRegistrationForm
                        onSuccess={() => router.push("/register/success")}
                        onCancel={() => router.back()}
                    />
                </div>
            </div>
        </main>
    );
}
