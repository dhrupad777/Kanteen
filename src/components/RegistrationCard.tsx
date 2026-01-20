"use client";

import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useState } from "react";
import { FileText, Smartphone, Mail, School, Users, User, ExternalLink, CheckCircle, Clock, AlertCircle, Trash2, GraduationCap, Hash } from "lucide-react";

interface Registration {
    id: string;
    event: string; // "Moot Court" or competition ID (for new records)
    competition?: string; // Fallback for old records
    eventType?: string; // "Competition" or undefined for Moot
    teamId?: string;
    userId?: string;
    createdAt: any;
    status: string;
    // Moot fields
    speaker1?: any;
    speaker2?: any;
    researcher?: any;
    // Competition fields
    topic?: string;
    name?: string;
    college?: string;
    phone?: string;
    email?: string;
    idFileUrls?: string[]; // Array of strings for competitions
    paymentScreenshotUrl: string;
}

export function RegistrationCard({ data }: { data: Registration }) {
    const isMoot = data.event === "Moot Court";
    const [deleting, setDeleting] = useState(false);

    // Helper to open file
    const openFile = (url: string) => window.open(url, "_blank");

    // Handle Delete
    const handleDelete = async () => {
        if (!window.confirm(`Are you sure you want to PERMANENTLY delete the registration for "${isMoot ? data.teamId : data.name}"? This cannot be undone.`)) {
            return;
        }

        setDeleting(true);
        try {
            await deleteDoc(doc(db, "registrations", data.id));
        } catch (error) {
            console.error("Error deleting document:", error);
            alert("Failed to delete. Check console for details.");
            setDeleting(false);
        }
    };

    // Get competition display name
    const getEventDisplayName = (event: string) => {
        const names: Record<string, string> = {
            'debate': 'Debate Competition',
            'csi': 'Crime Scene Investigation',
            'article': 'Article Writing',
            'paper_hybrid': 'Paper Presentation',
        };
        return names[event] || event?.toUpperCase().replace("_", " ") || "Unknown";
    };

    if (deleting) {
        return (
            <div className="bg-[#111] border border-red-500/30 rounded-xl p-8 flex flex-col items-center justify-center opacity-50 animate-pulse">
                <Trash2 className="w-8 h-8 text-red-500 mb-2" />
                <p className="text-red-400 text-sm">Deleting...</p>
            </div>
        );
    }

    return (
        <div className="bg-[#111] border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-all group relative">
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-gradient-to-r from-white/5 to-transparent flex justify-between items-start">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${isMoot ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                            {isMoot ? "🏛️ Moot Court" : `📋 ${getEventDisplayName(data.event || data.competition || "")}`}
                        </span>
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${data.status === 'verified' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {(data.status || "pending").replace("_", " ")}
                        </span>
                    </div>
                    <h3 className="font-bold text-white text-xl truncate">
                        {isMoot ? `Team: ${data.teamId?.split('_')[1] || 'Unknown'}` : data.name || 'Unknown'}
                    </h3>
                    <p className="text-white/40 text-xs font-mono mt-1">
                        📅 {data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown Date'}
                    </p>
                </div>
                <button
                    onClick={handleDelete}
                    className="p-2 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-500 transition-colors flex-shrink-0"
                    title="Delete Registration"
                >
                    <Trash2 size={16} />
                </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4 text-sm">

                {/* Competition Registration - Single Person Details */}
                {!isMoot && (
                    <div className="space-y-3">
                        {/* Contact Info Card */}
                        <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 p-4 rounded-xl border border-white/10 space-y-3">
                            <p className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                                <User size={12} />
                                Participant Details
                            </p>

                            {/* Name */}
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                                    <User size={14} className="text-white/60" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] text-white/40 uppercase tracking-wider">Full Name</p>
                                    <p className="text-white font-semibold truncate">{data.name || 'Not provided'}</p>
                                </div>
                            </div>

                            {/* Email */}
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                                    <Mail size={14} className="text-white/60" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] text-white/40 uppercase tracking-wider">Email Address</p>
                                    <p className="text-blue-400 font-medium truncate">{data.email || 'Not provided'}</p>
                                </div>
                            </div>

                            {/* Phone */}
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                                    <Smartphone size={14} className="text-white/60" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] text-white/40 uppercase tracking-wider">Phone Number</p>
                                    <p className="text-green-400 font-medium">{data.phone || 'Not provided'}</p>
                                </div>
                            </div>

                            {/* College */}
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                                    <GraduationCap size={14} className="text-white/60" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] text-white/40 uppercase tracking-wider">College/University</p>
                                    <p className="text-white/80 font-medium truncate">{data.college || 'Not provided'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Moot Court Registration - Team Details */}
                {isMoot && (
                    <div className="space-y-3">
                        {/* Speaker 1 */}
                        <ParticipantCard
                            role="Speaker 1"
                            name={data.speaker1?.name}
                            email={data.speaker1?.email}
                            phone={data.speaker1?.mobile}
                            studentId={data.speaker1?.studentId}
                            color="amber"
                        />

                        {/* Speaker 2 */}
                        <ParticipantCard
                            role="Speaker 2"
                            name={data.speaker2?.name}
                            email={data.speaker2?.email}
                            phone={data.speaker2?.mobile}
                            studentId={data.speaker2?.studentId}
                            color="blue"
                        />

                        {/* Researcher */}
                        <ParticipantCard
                            role="Researcher"
                            name={data.researcher?.name}
                            email={data.researcher?.email}
                            phone={data.researcher?.mobile}
                            studentId={data.researcher?.studentId}
                            color="purple"
                        />
                    </div>
                )}

                {/* Files Section */}
                <div className="pt-3 border-t border-white/5 space-y-2">
                    <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">📎 Attachments</p>
                    <div className="flex flex-wrap gap-2">
                        {/* Payment Screenshot */}
                        {data.paymentScreenshotUrl && (
                            <button
                                onClick={() => openFile(data.paymentScreenshotUrl)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-900/30 border border-green-500/30 hover:bg-green-900/50 text-xs text-green-400 font-medium transition-colors"
                            >
                                <FileText size={12} />
                                💳 Payment Proof
                            </button>
                        )}

                        {/* ID Cards */}
                        {isMoot ? (
                            <>
                                <IDButton url={data.speaker1?.idFileUrl} label="S1 ID" />
                                <IDButton url={data.speaker2?.idFileUrl} label="S2 ID" />
                                <IDButton url={data.researcher?.idFileUrl} label="Res ID" />
                            </>
                        ) : (
                            data.idFileUrls?.map((url, i) => (
                                <IDButton key={i} url={url} label={`ID ${i + 1}`} />
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Participant Card for Moot Court members
function ParticipantCard({ role, name, email, phone, studentId, color }: {
    role: string;
    name?: string;
    email?: string;
    phone?: string;
    studentId?: string;
    color: 'amber' | 'blue' | 'purple';
}) {
    const colorClasses = {
        amber: 'from-amber-500/10 to-orange-500/10 border-amber-500/20',
        blue: 'from-blue-500/10 to-cyan-500/10 border-blue-500/20',
        purple: 'from-purple-500/10 to-pink-500/10 border-purple-500/20',
    };
    const textColor = {
        amber: 'text-amber-400',
        blue: 'text-blue-400',
        purple: 'text-purple-400',
    };

    return (
        <div className={`bg-gradient-to-br ${colorClasses[color]} p-3 rounded-xl border space-y-2`}>
            <p className={`text-xs font-bold ${textColor[color]} uppercase tracking-wider`}>{role}</p>
            <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                    <User size={12} className="text-white/40 flex-shrink-0" />
                    <span className="text-white font-semibold text-sm truncate">{name || 'Not provided'}</span>
                </div>
                <div className="flex items-center gap-2">
                    <Mail size={12} className="text-white/40 flex-shrink-0" />
                    <span className="text-blue-400 text-xs truncate">{email || 'No email'}</span>
                </div>
                <div className="flex items-center gap-2">
                    <Smartphone size={12} className="text-white/40 flex-shrink-0" />
                    <span className="text-green-400 text-xs">{phone || 'No phone'}</span>
                </div>
                {studentId && (
                    <div className="flex items-center gap-2">
                        <Hash size={12} className="text-white/40 flex-shrink-0" />
                        <span className="text-white/60 text-xs font-mono">{studentId}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

function IDButton({ url, label }: { url?: string, label: string }) {
    if (!url) return null;
    return (
        <button
            onClick={() => window.open(url, "_blank")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-900/20 border border-blue-500/20 hover:bg-blue-900/30 text-xs text-blue-400 transition-colors"
        >
            <UserIcon size={12} />
            {label}
        </button>
    );
}

function UserIcon({ size }: { size: number }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
    )
}
