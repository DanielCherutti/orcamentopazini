"use client";

/**
 * Comprime uma imagem base64 para caber no localStorage (limite ~5MB).
 * Reduz dimensões e qualidade para evitar QuotaExceededError.
 */
export async function compressBase64Image(
  dataUrl: string,
  options?: { maxWidth?: number; maxHeight?: number; quality?: number }
): Promise<string> {
  const { maxWidth = 800, maxHeight = 800, quality = 0.7 } = options ?? {};

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(dataUrl);
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(dataUrl);
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => reject(new Error("Falha ao carregar imagem para compressão"));
    img.src = dataUrl;
  });
}
