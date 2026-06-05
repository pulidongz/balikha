// Deterministic verification of the security-critical sanitizeImage helper.
// Generates all fixtures in-memory with sharp (no committed binary fixtures),
// asserts the six security properties, and exits non-zero on any failure so it
// is usable as a CI gate (`npm run test:images`).
//
// sanitizeImage transitively imports the env module (via the logger), which
// validates a full set of env vars at module-eval time. So the script can run
// in a bare CI environment (no .env, no secrets), we inject harmless
// placeholders for every required var BEFORE the dynamic import of the helper.
// None of these values are used by sanitizeImage — only sharp runs. Existing
// real env vars are preserved (??=), so this never clobbers a real config.
const ENV_PLACEHOLDERS: Record<string, string> = {
  DATABASE_URL: 'postgres://placeholder:placeholder@localhost:5432/placeholder',
  BETTER_AUTH_SECRET: 'placeholder-better-auth-secret-at-least-32-chars',
  BETTER_AUTH_URL: 'http://localhost:3000',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY_ID: 'placeholder',
  S3_SECRET_ACCESS_KEY: 'placeholder',
  S3_BUCKET: 'placeholder',
  S3_PUBLIC_URL_BASE: 'http://localhost:9000/placeholder',
  EMAIL_FROM: 'placeholder@example.com',
  EMAIL_REPLY_TO: 'placeholder@example.com',
  TURNSTILE_SECRET_KEY: 'placeholder',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'placeholder',
};
for (const [name, value] of Object.entries(ENV_PLACEHOLDERS)) {
  process.env[name] ??= value;
}

import sharp from 'sharp';

let failures = 0;

function check(label: string, passed: boolean): void {
  if (passed) {
    process.stdout.write(`  ok  - ${label}\n`);
  } else {
    console.error(`  FAIL - ${label}`);
    failures += 1;
  }
}

async function main(): Promise<void> {
  const { sanitizeImage, MAX_IMAGE_DIMENSION, IMAGE_FORMAT_META } =
    await import('@/lib/storage/sanitize-image');
  const { buildProductImageKey } = await import('@/lib/storage/keys');

  const opts = {
    maxBytes: 10 * 1024 * 1024,
    maxDimension: MAX_IMAGE_DIMENSION,
    allowedFormats: ['jpeg', 'png', 'webp', 'avif'] as const,
  };

  // (1) A non-image buffer (random bytes) is rejected.
  {
    const randomBytes = Buffer.from(
      Array.from({ length: 1024 }, () => Math.floor(Math.random() * 256)),
    );
    const result = await sanitizeImage(randomBytes, {
      ...opts,
      allowedFormats: [...opts.allowedFormats],
    });
    check('non-image buffer is rejected', !result.ok);
  }

  // (2) An image with injected EXIF has its EXIF stripped after sanitize.
  {
    const withExif = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'Balikha test', Artist: 'fixture' } })
      .toBuffer();

    const inMeta = await sharp(withExif).metadata();
    const hadExif = inMeta.exif !== undefined;

    const result = await sanitizeImage(withExif, {
      ...opts,
      allowedFormats: [...opts.allowedFormats],
    });
    if (!result.ok) {
      check('EXIF-bearing image sanitizes successfully', false);
    } else {
      const outMeta = await sharp(result.data.data).metadata();
      check('fixture actually carried EXIF before sanitize', hadExif);
      check('sanitized image has no EXIF block', outMeta.exif === undefined);
    }
  }

  // (3) An EXIF orientation tag is honored (baked) then dropped. Build a
  // landscape (wide) image, tag it orientation 6 (rotate 90deg CW on display);
  // after sanitize the orientation tag must be gone AND the pixels rotated so
  // the output is portrait (the baked rotation swapped width/height).
  {
    const oriented = await sharp({
      create: { width: 80, height: 40, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await sanitizeImage(oriented, {
      ...opts,
      allowedFormats: [...opts.allowedFormats],
    });
    if (!result.ok) {
      check('oriented image sanitizes successfully', false);
    } else {
      const outMeta = await sharp(result.data.data).metadata();
      const orientationDropped = outMeta.orientation === undefined || outMeta.orientation === 1;
      // Orientation 6 means display rotated 90deg: the 80x40 source becomes
      // 40x80 once the rotation is baked into the pixels.
      const baked = result.data.width === 40 && result.data.height === 80;
      check('orientation tag dropped after sanitize', orientationDropped);
      check('EXIF orientation baked into pixels (dimensions rotated)', baked);
    }
  }

  // (4) A buffer over maxBytes is rejected.
  {
    const valid = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    const result = await sanitizeImage(valid, {
      ...opts,
      maxBytes: 10, // far below the tiny PNG's size
      allowedFormats: [...opts.allowedFormats],
    });
    check('over-maxBytes buffer is rejected', !result.ok);
  }

  // (5) An image over maxDimension is rejected.
  {
    const tall = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const result = await sanitizeImage(tall, {
      ...opts,
      maxDimension: 5, // below the 10x10 image
      allowedFormats: [...opts.allowedFormats],
    });
    check('over-maxDimension image is rejected', !result.ok);
  }

  // (6) A disallowed format (gif) is rejected.
  {
    const gif = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 5, g: 5, b: 5 } },
    })
      .gif()
      .toBuffer();
    const result = await sanitizeImage(gif, { ...opts, allowedFormats: [...opts.allowedFormats] });
    check('disallowed format (gif) is rejected', !result.ok);
  }

  // (7) A sanitized JPEG buffer yields a storage key ending in ".jpg".
  // Regression guard for buildProductImageKey receiving a bare ext (not a
  // dotted filename) — the old implementation extracted ext via lastIndexOf('.')
  // and fell back to 'bin' when no dot was present.
  {
    const jpeg = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const result = await sanitizeImage(jpeg, {
      ...opts,
      allowedFormats: [...opts.allowedFormats],
    });
    if (!result.ok) {
      check('JPEG sanitizes for key-extension assertion', false);
    } else {
      const ext = IMAGE_FORMAT_META[result.data.format].ext;
      const key = buildProductImageKey('test-product-id', ext);
      check('sanitized JPEG yields a storage key ending in .jpg', key.endsWith('.jpg'));
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  process.stdout.write('\nAll sanitizeImage assertions passed.\n');
}

main().catch((e) => {
  console.error('check-sanitize-image crashed:', e);
  process.exit(1);
});
