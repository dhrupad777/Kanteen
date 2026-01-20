"use client";

import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { Loader2, Upload, CheckCircle, AlertCircle } from "lucide-react";
import Image from "next/image";

interface CompetitionsRegistrationFormProps {
    onSuccess: () => void;
    onCancel: () => void;
}

const competitions = [
    { id: "debate", name: "Debate Competition (Offline)", fee: 885 },
    { id: "csi", name: "Crime Scene Investigation (Offline)", fee: 1180 },
    { id: "article", name: "Article Writing (Online)", fee: 885 },
    { id: "paper_hybrid", name: "Paper Presentation (Hybrid)", fee: 885 },
];

// Helper to generate UPI link
function getUPILink(competitionId: string): string {
    const comp = competitions.find(c => c.id === competitionId);
    const fee = comp?.fee || 750;
    const name = comp?.name || "Competition";
    const encodedNote = encodeURIComponent(`${name} - Vidhi Dharmotsav`);
    return `upi://pay?pa=lekshmijijish@okhdfcbank&pn=Vidhi%20Dharmotsav&am=${fee}&cu=INR&tn=${encodedNote}`;
}

export function CompetitionsRegistrationForm({ onSuccess, onCancel }: CompetitionsRegistrationFormProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: "",
        college: "",
        phone: "",
        email: "",
        competition: "",
    });

    // File States
    const [idFiles, setIdFiles] = useState<File[]>([]);
    const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: "id" | "payment") => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            if (type === "id") {
                // Max 5 files
                setIdFiles(prev => [...prev, ...files].slice(0, 5));
            } else {
                setPaymentScreenshot(files[0]);
            }
        }
    };

    const removeFile = (index: number) => {
        setIdFiles(prev => prev.filter((_, i) => i !== index));
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

        if (!formData.competition) {
            setError("Please select a competition.");
            setLoading(false);
            return;
        }

        if (idFiles.length === 0 || !paymentScreenshot) {
            setError("Please upload both Student ID(s) and Payment Screenshot.");
            setLoading(false);
            return;
        }

        try {
            const userId = `${Date.now()}_${formData.name.replace(/\s+/g, "_")}`;
            const basePath = `registrations/${formData.competition}/${userId}`;

            const getExt = (file: File) => file.name.split('.').pop() || 'png';

            // Upload IDs with indexed names
            const idUrls = await Promise.all(
                idFiles.map((file, index) => uploadFile(file, `${basePath}/ID_Card_${index + 1}.${getExt(file)}`))
            );

            // Upload Payment
            const paymentUrl = await uploadFile(paymentScreenshot, `${basePath}/Payment_Screenshot.${getExt(paymentScreenshot)}`);

            // Save to Firestore
            await addDoc(collection(db, "registrations"), {
                ...formData,
                event: formData.competition, // Save competition ID as event for consistency
                eventType: "Competition",
                createdAt: serverTimestamp(),
                userId,
                idFileUrls: idUrls,
                paymentScreenshotUrl: paymentUrl,
                status: "pending_verification"
            });

            onSuccess();
        } catch (err) {
            console.error("Registration error:", err);
            setError("Failed to register. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Info Section - Expanded, No Scrollbar */}
            <div className="bg-white/5 border border-white/10 p-4 rounded-lg space-y-4 text-sm text-white/80">
                <h3 className="text-amber-400 font-bold text-lg border-b border-white/10 pb-2">Competitions Registration</h3>

                <div className="space-y-2">
                    <p className="font-semibold text-amber-200">Registration Fees (Inclusive of 18% GST):</p>
                    <ul className="list-disc pl-4 space-y-1 text-xs">
                        <li><strong>Debate:</strong> ₹750 + 18% GST = <span className="text-white font-semibold">₹885</span> per participant</li>
                        <li><strong>CSI:</strong> ₹1,000 + 18% GST = <span className="text-white font-semibold">₹1,180</span> per team</li>
                        <li><strong>Article Writing:</strong> ₹750 + 18% GST = <span className="text-white font-semibold">₹885</span> per participant</li>
                        <li><strong>Paper Presentation:</strong>
                            <ul className="list-disc pl-4 mt-1">
                                <li>Amity Students: ₹500 + 0% GST = <span className="text-white font-semibold">₹500</span></li>
                                <li>Outsiders: ₹750 + 18% GST = <span className="text-white font-semibold">₹885</span></li>
                                <li>Academicians & Others: ₹1,000 + 18% GST = <span className="text-white font-semibold">₹1,180</span></li>
                            </ul>
                        </li>
                    </ul>
                    <p className="text-xs text-red-400 mt-2 font-medium">⚠️ All fees include applicable GST as mentioned above</p>
                </div>

                <div className="space-y-2">
                    <p className="font-semibold text-amber-200">Prizes:</p>
                    <ul className="list-disc pl-4 space-y-1 text-xs">
                        <li>Debate: ₹3000 (For/Against) + Certs</li>
                        <li>CSI: Winner ₹7500</li>
                        <li>Article Writing: ₹3500 (Win), ₹2500 (Runner)</li>
                        <li>Paper Presentation: ₹3500 (Win), ₹2000 (Runner)</li>
                    </ul>
                </div>

                <div className="text-xs text-white/50 pt-2 border-t border-white/10">
                    <p>Contacts: Tania Dsouza (8879016793), Nirvaan Sharma (8329791226), Mansi Singh (8454895204)</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs text-white/60">Full Name *</label>
                        <input
                            required
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded p-3 text-white focus:border-amber-500 focus:outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-white/60">College/University *</label>
                        <input
                            required
                            type="text"
                            value={formData.college}
                            onChange={(e) => setFormData({ ...formData, college: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded p-3 text-white focus:border-amber-500 focus:outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-white/60">Phone Number <span className="text-red-400">* (Required)</span></label>
                        <input
                            required
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            placeholder="Enter your phone number"
                            className="w-full bg-black/40 border border-white/10 rounded p-3 text-white focus:border-amber-500 focus:outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-white/60">Email ID <span className="text-red-400">* (Required)</span></label>
                        <input
                            required
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            placeholder="Enter your email address"
                            className="w-full bg-black/40 border border-white/10 rounded p-3 text-white focus:border-amber-500 focus:outline-none"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-white/80">Select Competition *</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {competitions.map((comp) => (
                            <label
                                key={comp.id}
                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${formData.competition === comp.id ? 'bg-amber-500/20 border-amber-500' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                            >
                                <input
                                    type="radio"
                                    name="competition"
                                    value={comp.id}
                                    checked={formData.competition === comp.id}
                                    onChange={(e) => setFormData({ ...formData, competition: e.target.value })}
                                    className="accent-amber-500 w-4 h-4"
                                />
                                <span className="text-sm text-white">{comp.name}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* File Uploads + QR Code Section */}
                <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm text-white/80">Student ID (Max 5 files) *</label>
                            <div className="border border-white/10 bg-black/20 rounded-lg p-4 h-32">
                                <input
                                    type="file"
                                    multiple
                                    id="id-upload"
                                    className="hidden"
                                    onChange={(e) => handleFileChange(e, "id")}
                                    accept="image/*,.pdf"
                                />
                                <label htmlFor="id-upload" className="flex flex-col items-center justify-center cursor-pointer h-full border-2 border-dashed border-white/10 rounded hover:border-amber-500/50 hover:bg-white/5 transition-colors">
                                    <Upload size={20} className="text-white/40 mb-2" />
                                    <span className="text-xs text-white/60">Click to upload IDs</span>
                                    {idFiles.length > 0 && <span className="text-[10px] text-amber-400 mt-1">{idFiles.length} file(s) selected</span>}
                                </label>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm text-white/80">Payment Screenshot *</label>
                            <div className="border border-white/10 bg-black/20 rounded-lg p-4 h-32">
                                <input
                                    type="file"
                                    id="payment-upload"
                                    className="hidden"
                                    onChange={(e) => handleFileChange(e, "payment")}
                                    accept="image/*,.pdf"
                                />
                                <label htmlFor="payment-upload" className={`flex flex-col items-center justify-center cursor-pointer h-full border-2 border-dashed rounded transition-colors ${paymentScreenshot ? 'border-green-500/50 bg-green-500/10' : 'border-white/10 hover:border-amber-500/50 hover:bg-white/5'}`}>
                                    {paymentScreenshot ? (
                                        <>
                                            <CheckCircle size={24} className="text-green-500 mb-2" />
                                            <span className="text-xs text-green-400 truncate max-w-[150px]">{paymentScreenshot.name}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Upload size={20} className="text-white/40 mb-2" />
                                            <span className="text-xs text-white/60">Upload Screenshot</span>
                                        </>
                                    )}
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* QR Code */}
                    <div className="p-4 bg-white rounded-lg flex flex-col items-center justify-center text-black space-y-3 h-full min-h-[250px]">
                        <div className="relative w-48 h-48">
                            {/* Ensure public/image.png exists */}
                            <Image
                                src="/image.png"
                                alt="Payment QR Code"
                                fill
                                className="object-contain"
                            />
                        </div>
                        <div className="text-center space-y-1">
                            <p className="font-bold text-sm">Scan to Pay Registration Fees</p>
                            {formData.competition ? (
                                <a
                                    href={getUPILink(formData.competition)}
                                    className="block text-blue-600 hover:text-blue-800 underline text-xs font-medium"
                                >
                                    Pay ₹{competitions.find(c => c.id === formData.competition)?.fee || 750} via UPI App
                                </a>
                            ) : (
                                <p className="text-xs text-gray-500">Select a competition first</p>
                            )}
                            <p className="text-xs text-gray-600">lekshmijijish@okhdfcbank</p>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="text-red-400 text-sm bg-red-500/10 p-3 rounded border border-red-500/20">
                        {error}
                    </div>
                )}

                <div className="flex flex-col-reverse sm:flex-row gap-4 pt-4 border-t border-white/10">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-6 py-3 rounded-lg border border-white/10 text-white/60 hover:text-white w-full sm:w-auto"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-lg p-3 flex items-center justify-center gap-2 disabled:opacity-50 w-full sm:w-auto"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : "Submit Registration"}
                    </button>
                </div>
            </form>
        </div>
    );
}
