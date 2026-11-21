/** Browser-side image work for the editor: files in, data URLs out. */

export function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    img.src = url;
  });
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return canvas;
}

/**
 * A sprite keeps its alpha channel, so it is resampled as WebP (or PNG where
 * WebP encoding is unavailable) with its long edge inside `maxEdge`.
 */
export async function prepareSprite(file: File, maxEdge = 720): Promise<{ dataUrl: string; w: number; h: number }> {
  const raw = await readAsDataURL(file);
  const img = await loadImage(raw);
  const iw = img.naturalWidth || 1;
  const ih = img.naturalHeight || 1;
  const k = Math.min(1, maxEdge / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * k));
  const h = Math.max(1, Math.round(ih * k));
  if (/^data:image\/svg\+xml/i.test(raw) && k === 1) {
    /* an SVG stays vector; the frame stays small either way */
    return { dataUrl: raw, w: iw, h: ih };
  }
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: raw, w: iw, h: ih };
  ctx.drawImage(img, 0, 0, w, h);
  let out = canvas.toDataURL('image/webp', 0.94);
  if (!/^data:image\/webp/i.test(out)) out = canvas.toDataURL('image/png');
  return { dataUrl: out, w, h };
}

/** Crops the chosen part of a photograph into the frame's own aspect ratio. */
export function cropToDataUrl(
  img: CanvasImageSource & { naturalWidth?: number; naturalHeight?: number },
  source: { x: number; y: number; w: number; h: number },
  outW: number,
  outH: number,
): string {
  const canvas = makeCanvas(outW, outH);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, source.x, source.y, source.w, source.h, 0, 0, canvas.width, canvas.height);
  let out = canvas.toDataURL('image/webp', 0.9);
  if (!/^data:image\/webp/i.test(out)) out = canvas.toDataURL('image/jpeg', 0.9);
  return out;
}

/** The output size for a cropped background: the frame's own pixels, capped. */
export function backgroundOutputSize(frameW: number, frameH: number, longEdge = 1400): { w: number; h: number } {
  const k = Math.min(1, longEdge / Math.max(frameW, frameH));
  return { w: Math.max(2, Math.round(frameW * k)), h: Math.max(2, Math.round(frameH * k)) };
}

/** Roughly how many bytes a data URL carries, for the share-link warning. */
export function dataUrlBytes(dataUrl: string): number {
  const at = dataUrl.indexOf(',');
  if (at < 0) return 0;
  return Math.round((dataUrl.length - at - 1) * 0.75);
}
