import sharp from 'sharp';
import { env } from '@/env';

// Fetches a photo and inlines it as a data URI for next/og share cards.
// satori's <img> decoder only handles png/jpeg/gif — webp and avif (both
// accepted by the upload pipeline, see lib/storage/sanitize-image.ts)
// crash the render mid-stream, which the edge surfaces as a 502.
// Re-encoding everything to jpeg keeps the card render format-proof and
// caps the payload at card width (kinder to the 1 GB prod box).
// null means "no usable photo" — callers render the text-only card.
export async function ogPhotoDataUri(url: string): Promise<string | null> {
  try {
    const absolute = url.startsWith('http') ? url : `${env.NEXT_PUBLIC_APP_URL}${url}`;
    const res = await fetch(absolute);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const jpeg = await sharp(buf)
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch {
    return null;
  }
}
