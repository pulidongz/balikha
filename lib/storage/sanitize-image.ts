import sharp from 'sharp';
import { ok, err, type Result } from '@/lib/result';
import { logger } from '@/lib/logger';

// The security boundary for ALL image uploads (products, banners, avatars).
// It validates the REAL bytes (via sharp's magic-byte format detection) — never
// the client-claimed content-type — and re-encodes to strip EXIF/metadata.
// Each calling surface passes its own `allowedFormats` set explicitly (no
// default) so AVIF can be allowed for products but not banners/avatars.

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif';

// The product-image surface allows AVIF; banner/avatar pass their own
// (['jpeg','png','webp']) set instead.
export const ALLOWED_IMAGE_FORMATS: ImageFormat[] = ['jpeg', 'png', 'webp', 'avif'];

// Preserves the prior product ceiling (the deleted confirm-upload validator
// allowed up to 20000px) so no previously-valid photo is newly rejected.
export const MAX_IMAGE_DIMENSION = 20000;

export const IMAGE_FORMAT_META: Record<ImageFormat, { contentType: string; ext: string }> = {
  jpeg: { contentType: 'image/jpeg', ext: 'jpg' },
  png: { contentType: 'image/png', ext: 'png' },
  webp: { contentType: 'image/webp', ext: 'webp' },
  avif: { contentType: 'image/avif', ext: 'avif' },
};

function isAllowedFormat(
  format: string | undefined,
  allowed: ImageFormat[],
): format is ImageFormat {
  return format !== undefined && (allowed as string[]).includes(format);
}

export async function sanitizeImage(
  buffer: Buffer,
  opts: { maxBytes: number; maxDimension: number; allowedFormats: ImageFormat[] },
): Promise<
  Result<{
    data: Buffer;
    format: ImageFormat;
    contentType: string;
    width: number;
    height: number;
  }>
> {
  if (buffer.length > opts.maxBytes) {
    logger.warn({ bytes: buffer.length, maxBytes: opts.maxBytes }, 'Image rejected: over byte cap');
    return err('Image is too large.');
  }

  try {
    // Default failOn: 'error' — the helper is the security boundary and must
    // reject malformed input rather than tolerate truncation.
    const metadata = await sharp(buffer).metadata();
    const { width, height } = metadata;
    // sharp reports an AVIF file as format 'heif' with compression 'av1' (HEIC
    // is 'heif' with 'hevc'). Normalize to 'avif' so the allowlist entry
    // actually matches — otherwise every real AVIF is rejected as an unknown
    // 'heif', while genuine HEIC stays (correctly) unsupported.
    const format =
      metadata.format === 'heif' && metadata.compression === 'av1' ? 'avif' : metadata.format;

    if (!isAllowedFormat(format, opts.allowedFormats)) {
      logger.warn({ format, allowed: opts.allowedFormats }, 'Image rejected: disallowed format');
      return err('Unsupported image format.');
    }

    if (width === undefined || height === undefined) {
      logger.warn({ format }, 'Image rejected: missing dimensions');
      return err('Could not read image dimensions.');
    }

    if (width > opts.maxDimension || height > opts.maxDimension) {
      logger.warn(
        { width, height, maxDimension: opts.maxDimension },
        'Image rejected: over dimension cap',
      );
      return err('Image dimensions are too large.');
    }

    // .rotate() (no args) bakes EXIF orientation into the pixels BEFORE the
    // re-encode drops all metadata — otherwise stripping the orientation tag
    // visually rotates some phone photos. sharp's default output drops EXIF.
    const data = await sharp(buffer).rotate().toFormat(format).toBuffer();

    // After .rotate() the pixel dimensions may swap for orientations 5-8, so
    // report the dimensions of the SANITIZED output, not the original metadata.
    const outMeta = await sharp(data).metadata();
    const outWidth = outMeta.width;
    const outHeight = outMeta.height;
    if (outWidth === undefined || outHeight === undefined) {
      logger.warn({ format }, 'Image rejected: missing dimensions after re-encode');
      return err('Could not read image dimensions.');
    }

    return ok({
      data,
      format,
      contentType: IMAGE_FORMAT_META[format].contentType,
      width: outWidth,
      height: outHeight,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.warn({ error: message }, 'Image rejected: sanitize failed');
    return err('Invalid or unreadable image.');
  }
}
