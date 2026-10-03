"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { invalidateLeaderboard } from "@/hooks/use-leaderboard";
import { compressAvatar } from "@/lib/compress-avatar";
import { cn } from "@/lib/utils";
import { Camera, Loader2, Trash2 } from "lucide-react";

/**
 * A leaderboard avatar that opens an enlarged view when tapped, Instagram-style.
 *
 * On your own row the enlarged view also offers replacing the picture. That is the only
 * entry point: nothing prompts, badges or nags a student to set one. It is there if they
 * dislike their Google photo and go looking, and invisible otherwise.
 *
 * The picture is re-encoded to a ~15 KB square WebP before upload (see
 * lib/compress-avatar.ts) and written to avatars/{uid}/ in Storage, which the Storage
 * rules scope to the signed-in student.
 */

interface LeaderboardAvatarProps {
    displayName: string;
    photoURL: string | null;
    /** Enables the change/remove controls inside the enlarged view. */
    isYou?: boolean;
    className?: string;
    /** Ring treatment used for the pinned "your rank" row. */
    ringed?: boolean;
}

export function LeaderboardAvatar({
    displayName, photoURL, isYou = false, className, ringed = false,
}: LeaderboardAvatarProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
    /** Own profile doc, so the Remove action appears only when there is one to remove. */
    const [customPath, setCustomPath] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const canEdit = isYou && !!user;

    // users/{uid} is read-own in firestore.rules, so this only ever reads the caller's
    // own document. Subscribed only while the dialog is open on your own avatar.
    useEffect(() => {
        if (!open || !canEdit || !user) return;
        const unsub = onSnapshot(
            doc(db, "users", user.uid),
            (snap) => {
                const path = snap.exists() ? snap.data().customPhotoPath : null;
                setCustomPath(typeof path === "string" && path ? path : null);
            },
            () => setCustomPath(null),
        );
        return () => unsub();
    }, [open, canEdit, user]);

    const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;
        if (fileInputRef.current) fileInputRef.current.value = "";

        if (!file.type.startsWith("image/")) {
            toast({ title: "Not an image", description: "Pick a photo from your gallery.", variant: "destructive" });
            return;
        }

        setBusy("upload");
        const previousPath = customPath;
        try {
            const { blob, contentType, extension } = await compressAvatar(file);

            // Timestamped so a replacement is not served from the CDN cache under the
            // old URL, which would show the student their previous photo indefinitely.
            const path = `avatars/${user.uid}/${Date.now()}.${extension}`;
            await uploadBytes(ref(storage, path), blob, {
                contentType,
                cacheControl: "public, max-age=86400",
            });
            const url = await getDownloadURL(ref(storage, path));

            // Written only after the upload succeeds, so a failure leaves the student on
            // whatever picture they had rather than a broken image.
            await setDoc(
                doc(db, "users", user.uid),
                { customPhotoURL: url, customPhotoPath: path, updatedAt: serverTimestamp() },
                { merge: true },
            );

            if (previousPath && previousPath !== path) {
                deleteObject(ref(storage, previousPath)).catch(() => {});
            }

            // The board caches its response; without this the student would keep seeing
            // their old picture until the next revalidation.
            invalidateLeaderboard();
            toast({ title: "Photo updated" });
            setOpen(false);
        } catch (err: any) {
            toast({
                title: "Could not update photo",
                // Both failure modes here are "the rules for this are not live yet",
                // which is unguessable from the SDK's own wording. Name the file.
                description: err?.code === "storage/unauthorized"
                    ? "Storage rules rejected the upload. Deploy storage.rules, then try again."
                    : err?.code === "permission-denied"
                        ? "Firestore rules rejected the change. Deploy firestore.rules (it needs customPhotoURL on the users allowlist), then try again."
                        : err?.message || "Something went wrong.",
                variant: "destructive",
            });
        } finally {
            setBusy(null);
        }
    };

    const handleRemove = async () => {
        if (!user) return;
        setBusy("remove");
        const previousPath = customPath;
        try {
            await setDoc(
                doc(db, "users", user.uid),
                { customPhotoURL: null, customPhotoPath: null, updatedAt: serverTimestamp() },
                { merge: true },
            );
            if (previousPath) deleteObject(ref(storage, previousPath)).catch(() => {});
            invalidateLeaderboard();
            toast({ title: "Back to your Google photo" });
            setOpen(false);
        } catch (err: any) {
            toast({
                title: "Could not remove photo",
                description: err?.code === "permission-denied"
                    ? "Firestore rules rejected the change. Deploy firestore.rules, then try again."
                    : err?.message,
                variant: "destructive",
            });
        } finally {
            setBusy(null);
        }
    };

    const initial = displayName.charAt(0).toUpperCase();

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={isYou ? "Your photo — tap to view or change" : `${displayName}'s photo`}
                className="shrink-0 rounded-full transition-transform active:scale-95"
            >
                <Avatar className={cn(className, ringed && "ring-2 ring-orange-300")}>
                    {photoURL && <AvatarImage src={photoURL} alt="" />}
                    <AvatarFallback className="bg-orange-100 text-xs font-bold text-orange-700">
                        {initial}
                    </AvatarFallback>
                </Avatar>
            </button>

            <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
                <DialogContent className="max-w-xs gap-0 overflow-hidden rounded-3xl p-0">
                    <DialogTitle className="sr-only">{displayName}</DialogTitle>

                    {/* Enlarged, circular, on a dark field so a light photo still reads
                        as a portrait rather than bleeding into the sheet. */}
                    <div className="flex flex-col items-center gap-3 bg-slate-900 px-6 py-7">
                        <Avatar className="h-40 w-40 ring-4 ring-white/10">
                            {photoURL && <AvatarImage src={photoURL} alt={displayName} />}
                            <AvatarFallback className="bg-orange-100 text-4xl font-black text-orange-700">
                                {initial}
                            </AvatarFallback>
                        </Avatar>
                        <p className="text-center text-sm font-bold text-white">{displayName}</p>
                    </div>

                    {canEdit && (
                        <div className="flex flex-col gap-2 p-4">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handlePick}
                                disabled={busy !== null}
                                className="hidden"
                            />
                            <Button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={busy !== null}
                                className="w-full gap-2 font-bold"
                            >
                                {busy === "upload"
                                    ? <><Loader2 className="h-4 w-4 animate-spin" />Updating…</>
                                    : <><Camera className="h-4 w-4" />{customPath ? "Change photo" : "Use your own photo"}</>}
                            </Button>

                            {customPath && (
                                <Button
                                    variant="ghost"
                                    onClick={handleRemove}
                                    disabled={busy !== null}
                                    className="w-full gap-2 text-muted-foreground"
                                >
                                    {busy === "remove"
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Trash2 className="h-4 w-4" />}
                                    Back to Google photo
                                </Button>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
