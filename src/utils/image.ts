/**
 * Read an image file and downscale it so uploads stay small enough to sync
 * quickly on school connections. PNGs keep transparency (signatures, logos);
 * everything else becomes JPEG.
 */
export function readImage(file: File, maxSize: number, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That image could not be opened."));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(reader.result as string); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const keepAlpha = file.type === "image/png" || file.type === "image/webp" || file.type === "image/gif";
        resolve(canvas.toDataURL(keepAlpha ? "image/png" : "image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export const IMAGE_SIZES = {
  avatar: 320,
  signature: 600,
  logo: 512,
  watermark: 1000,
  gallery: 1600,
} as const;
