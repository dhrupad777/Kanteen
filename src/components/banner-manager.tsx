"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ImageUp, RotateCcw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StudentBanner } from "@/types";

/**
 * Owner UI for the banner at the top of the student dashboard.
 *
 * Replaces editing a hardcoded <Image src="/RedBull.jpeg"> and redeploying. Lives on
 * /report, which is already owner-gated, and storage.rules independently requires the
 * isOwner claim — so the gate is enforced server-side, not just by which tab is visible.
 *
 * Writes `canteen_state/settings.studentBanner`. Students read that doc on a snapshot
 * they already have open, so a change appears without them reloading.
 */

/** Matches the ceiling in storage.rules. Checked here only to fail fast with a useful
 *  message instead of letting the upload start and be rejected mid-flight. */
const MAX_BYTES = 5 * 1024 * 1024;

/** The image bundled in /public, shown when nothing has been uploaded. */
const DEFAULT_BANNER_SRC = "/RedBull.jpeg";

interface Selection {
    file: File;
    previewUrl: string;
    width: number;
    height: number;
}

/** Reads a file's real pixel size, so the student page gets the true aspect ratio. */
function readImageSize(file: File): Promise<{ width: number; height: number; previewUrl: string }> {
    return new Promise((resolve, reject) => {
        const previewUrl = URL.createObjectURL(file);
        const probe = new window.Image();
        probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight, previewUrl });
        probe.onerror = () => {
            URL.revokeObjectURL(previewUrl);
            reject(new Error("That file could not be read as an image."));
        };
        probe.src = previewUrl;
    });
}

export function BannerManager() {
    const { user, userProfile } = useAuth();
    const { toast } = useToast();

    const [current, setCurrent] = useState<StudentBanner | null>(null);
    const [loading, setLoading] = useState(true);
    const [selection, setSelection] = useState<Selection | null>(null);
    const [progress, setProgress] = useState<number | null>(null);
    const [resetting, setResetting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const unsub = onSnapshot(
            doc(db, "canteen_state", "settings"),
            (snap) => {
                const b = snap.exists() ? snap.data().studentBanner : null;
                setCurrent(b && typeof b.url === "string" && b.url ? (b as StudentBanner) : null);
                setLoading(false);
            },
            () => setLoading(false),
        );
        return () => unsub();
    }, []);

    // Object URLs are a real leak if the owner tries several images in a row.
    useEffect(() => {
        return () => { if (selection) URL.revokeObjectURL(selection.previewUrl); };
    }, [selection]);

    const clearSelection = () => {
        if (selection) URL.revokeObjectURL(selection.previewUrl);
        setSelection(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            toast({ title: "Not an image", description: "Pick a JPG, PNG or WebP file.", variant: "destructive" });
            clearSelection();
            return;
        }
        if (file.size >= MAX_BYTES) {
            toast({
                title: "Image too large",
                description: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`,
                variant: "destructive",
            });
            clearSelection();
            return;
        }

        try {
            const { width, height, previewUrl } = await readImageSize(file);
            if (selection) URL.revokeObjectURL(selection.previewUrl);
            setSelection({ file, previewUrl, width, height });
        } catch (err: any) {
            toast({ title: "Could not read that file", description: err?.message, variant: "destructive" });
            clearSelection();
        }
    };

    const handlePublish = async () => {
        if (!selection || !user) return;
        setProgress(0);

        // Timestamped name rather than a fixed one: a fixed path would be served from
        // the CDN cache and students would keep seeing the old image.
        const extension = selection.file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `banners/student-${Date.now()}.${extension}`;
        const previousPath = current?.path;

        try {
            const task = uploadBytesResumable(ref(storage, path), selection.file, {
                contentType: selection.file.type,
                cacheControl: "public, max-age=3600",
            });

            await new Promise<void>((resolve, reject) => {
                task.on(
                    "state_changed",
                    (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
                    reject,
                    () => resolve(),
                );
            });

            const url = await getDownloadURL(task.snapshot.ref);

            // Only now is the banner swapped. If anything above failed, students keep
            // seeing the previous image rather than a broken one.
            await setDoc(
                doc(db, "canteen_state", "settings"),
                {
                    studentBanner: {
                        url,
                        path,
                        width: selection.width,
                        height: selection.height,
                        alt: "Canteen banner",
                        updatedAt: serverTimestamp(),
                        updatedByName: userProfile?.name || user.email || "",
                    },
                },
                { merge: true },
            );

            // Best-effort tidy-up of the file this one replaced. A failure here leaves an
            // orphaned object, which is harmless — never surfaced as a publish failure.
            if (previousPath && previousPath !== path) {
                deleteObject(ref(storage, previousPath)).catch(() => {});
            }

            clearSelection();
            toast({ title: "Banner updated", description: "Students see it straight away." });
        } catch (err: any) {
            toast({
                title: "Upload failed",
                description: err?.code === "storage/unauthorized"
                    ? "Storage rules rejected the upload. Deploy storage.rules, then try again."
                    : err?.message || "Something went wrong.",
                variant: "destructive",
            });
        } finally {
            setProgress(null);
        }
    };

    const handleReset = async () => {
        if (!window.confirm("Put the default banner back? The uploaded image will be deleted.")) return;
        setResetting(true);
        const previousPath = current?.path;
        try {
            await setDoc(doc(db, "canteen_state", "settings"), { studentBanner: null }, { merge: true });
            if (previousPath) deleteObject(ref(storage, previousPath)).catch(() => {});
            toast({ title: "Default banner restored" });
        } catch (err: any) {
            toast({ title: "Could not reset", description: err?.message, variant: "destructive" });
        } finally {
            setResetting(false);
        }
    };

    const uploading = progress !== null;
    const previewSrc = selection?.previewUrl ?? current?.url ?? DEFAULT_BANNER_SRC;
    const isShowingDefault = !selection && !current;

    return (
        <Card className="border-slate-200">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-bold">
                    <ImageUp className="h-5 w-5 text-primary" />
                    Student Banner
                </CardTitle>
                <CardDescription>
                    The image at the top of the student dashboard. Changes appear immediately —
                    students do not need to reload.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Preview at the real aspect ratio, so what is approved here is what ships. */}
                <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    {loading ? (
                        <div className="flex h-40 items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                        </div>
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- a blob: preview
                        // cannot go through the next/Image optimiser, and this is one admin view.
                        <img
                            src={previewSrc}
                            alt="Banner preview"
                            className={cn("h-auto w-full object-cover transition-opacity", uploading && "opacity-50")}
                        />
                    )}

                    {selection && (
                        <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary-foreground shadow-sm">
                            Not published yet
                        </span>
                    )}
                    {isShowingDefault && !loading && (
                        <span className="absolute left-3 top-3 rounded-full bg-slate-700/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">
                            Default
                        </span>
                    )}
                </div>

                {selection && (
                    <p className="text-xs text-muted-foreground">
                        {selection.width} × {selection.height} px ·{" "}
                        {(selection.file.size / 1024).toFixed(0)} KB
                        {selection.width < 1000 && (
                            <span className="ml-1 inline-flex items-center gap-1 font-semibold text-amber-600">
                                <AlertCircle className="h-3 w-3" />
                                may look soft on large screens
                            </span>
                        )}
                    </p>
                )}

                {uploading && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                            className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                )}

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePick}
                    disabled={uploading}
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-bold file:text-primary hover:file:bg-primary/20 disabled:opacity-50"
                />

                <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={handlePublish} disabled={!selection || uploading} className="font-bold">
                        {uploading
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading {progress}%</>
                            : "Publish to students"}
                    </Button>

                    {selection && !uploading && (
                        <Button variant="ghost" onClick={clearSelection}>Cancel</Button>
                    )}

                    {current && !selection && (
                        <Button variant="outline" onClick={handleReset} disabled={resetting} className="gap-1.5">
                            {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                            Reset to default
                        </Button>
                    )}
                </div>

                {current?.updatedByName && !selection && (
                    <p className="text-xs text-muted-foreground">
                        Last changed by {current.updatedByName}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
