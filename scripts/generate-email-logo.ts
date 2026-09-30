// Renders the Coil lockup in Sampaguita Cream to the PNG shown in the email
// band. Most email clients strip inline SVG, so email needs a raster copy.
// Output is committed; re-run only when the logo changes.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import {
  LOCKUP_SYMBOL_TRANSFORM,
  LOCKUP_VIEWBOX,
  LOCKUP_WORDMARK_PATH,
  SYMBOL_PATH,
} from '../components/brand/logo-paths';
import {
  EMAIL_LOGO_FILE,
  EMAIL_LOGO_HEIGHT,
  EMAIL_LOGO_SCALE,
  EMAIL_LOGO_WIDTH,
} from '../lib/email/logo';

const CREAM = '#FDFCF7';

async function main() {
  const width = EMAIL_LOGO_WIDTH * EMAIL_LOGO_SCALE;
  const height = EMAIL_LOGO_HEIGHT * EMAIL_LOGO_SCALE;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOCKUP_VIEWBOX}" width="${width}" ` +
    `height="${height}" fill="${CREAM}"><path transform="${LOCKUP_SYMBOL_TRANSFORM}" ` +
    `d="${SYMBOL_PATH}"/><path d="${LOCKUP_WORDMARK_PATH}"/></svg>`;
  const outPath = join('public', EMAIL_LOGO_FILE);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, await sharp(Buffer.from(svg)).png().toBuffer());
  console.error(`wrote ${outPath} (${width}x${height})`);
}

main().catch((error: unknown) => {
  console.error('Email logo generation failed:', error);
  process.exit(1);
});
