/**
 * Re-encodes a chosen photo into a small square avatar, in the browser, before it is
 * ever uploaded.
 *
 * Phone cameras produce 3-8 MB images; the leaderboard renders them at 32px. Uploading
 * the original would waste the student's data, the bucket, and every byte of every
 * other student's leaderboard load. A 256px WebP at quality 0.82 lands at roughly
 * 10-20 KB and is indistinguishable at the sizes actually rendered.
 *
 * Centre-cropped to a square because the avatar is circular everywhere it appears —
 * cropping here means the stored file matches what is displayed, rather than relying on
 * CSS to hide two thirds of a portrait photo.
 */

/** Rendered at 32-96px; 256 covers 3x displays and the expanded view with room spare. */
const TARGET_PX = 256;
const WEBP_QUALITY = 0.82;
/** Safari only gained canvas WebP encoding recently, so JPEG is the fallback. */
const JPEG_QUALITY = 0.85;

export interface CompressedAvatar {
    blob: Blob;
    /** 'image/webp' or 'image/jpeg', whichever the browser could actually produce. */
    contentType: string;
    extension: 'webp' | 'jpg';
}

function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new window.Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('That file could not be read as an image.'));
        };
        img.src = url;
    });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Returns a square, compressed avatar. Throws if the file is not a readable image.
 *
 * Deliberately has no upload or Firebase knowledge, so it can be reasoned about (and
 * later tested) on its own.
 */
export async function compressAvatar(file: File): Promise<CompressedAvatar> {
    const img = await loadImage(file);

    // Centre-crop to the largest square the source allows, then scale that down once.
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;

    // Never upscale: a 100px source stays 100px rather than being blown up to 256
    // and looking worse at a larger file size.
    const target = Math.min(TARGET_PX, side);

    const canvas = document.createElement('canvas');
    canvas.width = target;
    canvas.height = target;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not process that image.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target);

    // Try WebP first; a browser that cannot encode it returns PNG (or null), which
    // would be far larger than the JPEG fallback.
    const webp = await toBlob(canvas, 'image/webp', WEBP_QUALITY);
    if (webp && webp.type === 'image/webp') {
        return { blob: webp, contentType: 'image/webp', extension: 'webp' };
    }

    const jpeg = await toBlob(canvas, 'image/jpeg', JPEG_QUALITY);
    if (jpeg) {
        return { blob: jpeg, contentType: 'image/jpeg', extension: 'jpg' };
    }

    throw new Error('Your browser could not process that image.');
}
