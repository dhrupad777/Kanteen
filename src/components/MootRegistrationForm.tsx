"use client";

import { useState, useRef } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { Loader2, Upload, CheckCircle, AlertCircle } from "lucide-react";
import Image from "next/image";

interface MootRegistrationFormProps {
    onSuccess: () => void;
    onCancel: () => void;
}

interface ParticipantFields {
    name: string;
    mobile: string;
    email: string;
    studentId: string;
    idFile: File | null;
}

const initialParticipantState: ParticipantFields = {
    name: "",
    mobile: "",
    email: "",
    studentId: "",
    idFile: null,
};

export function MootRegistrationForm({ onSuccess, onCancel }: MootRegistrationFormProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form States
    const [speaker1, setSpeaker1] = useState<ParticipantFields>({ ...initialParticipantState });
    const [speaker2, setSpeaker2] = useState<ParticipantFields>({ ...initialParticipantState });
    const [researcher, setResearcher] = useState<ParticipantFields>({ ...initialParticipantState });
    const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);

    const updateField = (
        role: "speaker1" | "speaker2" | "researcher",
        field: keyof ParticipantFields,
        value: string | File | null
    ) => {
        const setter = role === "speaker1" ? setSpeaker1 : role === "speaker2" ? setSpeaker2 : setResearcher;
        setter((prev) => ({ ...prev, [field]: value }));
    };

    const uploadFile = async (file: File, path: string) => {
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        return getDownloadURL(storageRef);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (!speaker1.idFile || !speaker2.idFile || !researcher.idFile || !paymentScreenshot) {
            setError("Please upload all required files (ID cards and Payment Screenshot)");
            setLoading(false);
            return;
        }

        try {
            // Create a unique folder ID for this team
            const teamId = `${Date.now()}_${speaker1.name.replace(/\s+/g, "_")}`;
            const basePath = `registrations/moot_court/${teamId}`;

            // Helper to get extension
            const getExt = (file: File) => file.name.split('.').pop() || 'png';

            // Upload files with specific names for easy identification
            const uploads = await Promise.all([
                uploadFile(speaker1.idFile, `${basePath}/Speaker1_ID.${getExt(speaker1.idFile)}`),
                uploadFile(speaker2.idFile, `${basePath}/Speaker2_ID.${getExt(speaker2.idFile)}`),
                uploadFile(researcher.idFile, `${basePath}/Researcher_ID.${getExt(researcher.idFile)}`),
                uploadFile(paymentScreenshot, `${basePath}/Payment_Screenshot.${getExt(paymentScreenshot)}`),
            ]);

            const [s1Url, s2Url, rUrl, payUrl] = uploads;

            // Save to Firestore
            await addDoc(collection(db, "registrations"), {
                event: "Moot Court",
                createdAt: serverTimestamp(),
                teamId,
                speaker1: { ...speaker1, idFileUrl: s1Url, idFile: null }, // Don't save File object
                speaker2: { ...speaker2, idFileUrl: s2Url, idFile: null },
                researcher: { ...researcher, idFileUrl: rUrl, idFile: null },
                paymentScreenshotUrl: payUrl,
                status: "pending_verification"
            });

            onSuccess();
        } catch (err) {
            console.error("Registration error:", err);
            setError("Failed to register. Please check your internet connection and try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Intro Text */}
            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg space-y-3 text-sm text-white/80">
                <h3 className="text-amber-400 font-bold text-lg">Moot Court Competition - Registration</h3>
                <p>
                    Welcome to the Second edition of Vidhi Dharmotsav. Win exciting prizes by displaying your argumentative skills!
                </p>
                <div className="grid md:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1">
                        <p><span className="text-amber-200">Registration Fees:</span> ₹4,000 + 18% GST = <span className="font-bold text-white">₹4,720</span> per team</p>
                        <p><span className="text-amber-200">Accommodation:</span> ₹2,500 per team <span className="text-white/60">(For qualified teams only)</span></p>
                        <p className="text-xs text-red-400 mt-2">⚠️ All fees are inclusive of 18% GST as applicable</p>
                    </div>
                    <div className="space-y-1 text-xs text-white/60">
                        <p>President: Tania Dsouza (+91 8879016793)</p>
                        <p>Vice-President: Nirvaan Sharma (+91 8329791226)</p>
                        <p>Competitions Head: Mansi Singh (+91 8454895204)</p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
                {/* Speaker 1 */}
                <ParticipantSection
                    role="Speaker 1"
                    data={speaker1}
                    onChange={(field, val) => updateField("speaker1", field, val)}
                />

                {/* Speaker 2 */}
                <ParticipantSection
                    role="Speaker 2"
                    data={speaker2}
                    onChange={(field, val) => updateField("speaker2", field, val)}
                />

                {/* Researcher */}
                <ParticipantSection
                    role="Researcher"
                    data={researcher}
                    onChange={(field, val) => updateField("researcher", field, val)}
                />

                {/* Payment */}
                <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-4">
                    <h4 className="font-bold text-amber-400 text-lg">Payment Verification</h4>

                    {/* QR Code Section */}
                    <div className="flex flex-col items-center justify-center p-4 bg-white rounded-lg text-black space-y-2">
                        <div className="relative w-48 h-48">
                            <Image
                                src="/image.png"
                                alt="Payment QR Code"
                                fill
                                className="object-contain"
                            />
                        </div>
                        <p className="font-bold text-sm">Scan to Pay Registration Fees</p>
                        <a
                            href="upi://pay?pa=lekshmijijish@okhdfcbank&pn=Vidhi%20Dharmotsav&am=4720&cu=INR&tn=Moot%20Court%20Registration%20-%20Vidhi%20Dharmotsav"
                            className="text-blue-600 hover:text-blue-800 underline text-xs font-medium"
                        >
                            Pay ₹4,720 via UPI App
                        </a>
                        <p className="text-[10px] text-gray-500 mt-1">(₹4,000 + 18% GST)</p>
                        <p className="text-xs text-gray-500">lekshmijijish@okhdfcbank</p>
                    </div>

                    <p className="text-sm text-white/60">Please upload a screenshot of your payment confirmation.</p>
                    <FileUpload
                        label="Payment Screenshot"
                        file={paymentScreenshot}
                        onChange={setPaymentScreenshot}
                    />
                </div>

                {error && (
                    <div className="flex items-center gap-2 p-3 text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <AlertCircle size={16} />
                        <span className="text-sm">{error}</span>
                    </div>
                )}

                <div className="flex flex-col-reverse sm:flex-row gap-4 pt-4 sticky bottom-0 bg-[#0a0a0a] py-4 border-t border-white/10 z-10">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-6 py-3 rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-colors w-full sm:w-auto"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-lg p-3 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 w-full sm:w-auto"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : "Submit Team Registration"}
                    </button>
                </div>
            </form>
        </div>
    );
}

function ParticipantSection({ role, data, onChange }: { role: string, data: ParticipantFields, onChange: (f: keyof ParticipantFields, v: any) => void }) {
    return (
        <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-4">
            <h4 className="font-bold text-white text-lg border-l-4 border-amber-500 pl-3">{role}</h4>
            <div className="grid md:grid-cols-2 gap-4">
                <Input label="Name" value={data.name} onChange={v => onChange("name", v)} required />
                <Input label="Mobile No." value={data.mobile} onChange={v => onChange("mobile", v)} type="tel" required />
                <Input label="Email ID" value={data.email} onChange={v => onChange("email", v)} type="email" required />
                <Input label="Student ID" value={data.studentId} onChange={v => onChange("studentId", v)} required />
                <div className="md:col-span-2">
                    <FileUpload label={`Upload ${role} ID Card (Max 10MB)`} file={data.idFile} onChange={v => onChange("idFile", v)} />
                </div>
            </div>
        </div>
    );
}

function Input({ label, value, onChange, type = "text", required }: { label: string, value: string, onChange: (v: string) => void, type?: string, required?: boolean }) {
    return (
        <div className="space-y-1">
            <label className="text-xs text-white/50">{label} {required && "*"}</label>
            <input
                required={required}
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded p-2 text-white text-sm focus:border-amber-500 focus:outline-none transition-colors"
            />
        </div>
    );
}

function FileUpload({ label, file, onChange }: { label: string, file: File | null, onChange: (f: File | null) => void }) {
    const hiddenInput = useRef<HTMLInputElement>(null);

    return (
        <div className="space-y-1">
            <span className="text-xs text-white/50">{label} *</span>
            <div
                onClick={() => hiddenInput.current?.click()}
                className={`border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition-colors ${file ? 'border-green-500/50 bg-green-500/10' : 'border-white/10 hover:border-amber-500/50 hover:bg-white/5'}`}
            >
                <input
                    type="file"
                    ref={hiddenInput}
                    className="hidden"
                    accept="image/*,.pdf"
                    onChange={e => {
                        if (e.target.files?.[0]) onChange(e.target.files[0]);
                    }}
                />
                {file ? (
                    <div className="flex items-center gap-2 text-green-400">
                        <CheckCircle size={20} />
                        <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
                        <span className="text-xs text-white/40">Change?</span>
                    </div>
                ) : (
                    <div className="flex flex-col items-center text-white/40">
                        <Upload size={20} className="mb-2" />
                        <span className="text-xs">Click to upload PDF or Image</span>
                    </div>
                )}
            </div>
        </div>
    );
}
