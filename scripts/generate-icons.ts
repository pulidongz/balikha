// Generates Balikha's app icons from the Coil path data. Browser-tab sizes use
// the two-turn small drawing; the navy tiles use the thinner drawings made for
// light-on-dark use.
// Run: npm run icons
// Outputs: app/icon.svg, app/favicon.ico, app/icon.png, app/apple-icon.png
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  SYMBOL_REVERSED_PATH,
  SYMBOL_SMALL_PATH,
  SYMBOL_SMALL_REVERSED_PATH,
} from '../components/brand/logo-paths';

const APP = 'app';
const NAVY = '#1A2B3A';
const CREAM = '#FDFCF7';
// The symbol paths are drawn on a 256-unit canvas; 56 units is a 22 % radius.
const CANVAS = 256;
const TILE_RADIUS = 56;
const ICO_SIZES = [16, 32, 48];

// Scales the mark about the canvas centre, then lifts it by a fraction of the
// canvas so it sits on the optical centre rather than the geometric one.
function mark(d: string, scale: number, lift: number): string {
  const offset = (CANVAS / 2) * (1 - scale);
  return (
    `<g transform="translate(${offset} ${offset - CANVAS * lift}) scale(${scale})">` +
    `<path fill="${CREAM}" d="${d}"/></g>`
  );
}

function tile(body: string, { rounded }: { rounded: boolean }): string {
  const radius = rounded ? ` rx="${TILE_RADIUS}"` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" ` +
    `width="${CANVAS}" height="${CANVAS}"><rect width="${CANVAS}" height="${CANVAS}"${radius} ` +
    `fill="${NAVY}"/>${body}</svg>`
  );
}

// Renders at the target size when it is larger than the canvas, so big icons
// are drawn crisp instead of upscaled; small ones are downsampled from 256.
function png(svg: string, size: number): Promise<Buffer> {
  const density = 72 * Math.max(1, size / CANVAS);
  return sharp(Buffer.from(svg), { density }).resize(size, size).png().toBuffer();
}

// A PNG-embedded ICO: a 6-byte header, one 16-byte directory entry per image,
// then the PNG payloads.
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ data }) => data)]);
}

async function main() {
  // Browser tabs: the bare small drawing, navy on light tabs, cream on dark.
  const iconSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" ` +
    `width="${CANVAS}" height="${CANVAS}" role="img" aria-label="Balikha">` +
    `<style>path{fill:${NAVY}}@media (prefers-color-scheme: dark){path{fill:${CREAM}}}</style>` +
    `<path d="${SYMBOL_SMALL_PATH}"/></svg>\n`;
  await writeFile(join(APP, 'icon.svg'), iconSvg);

  const faviconTile = tile(mark(SYMBOL_SMALL_REVERSED_PATH, 0.74, 0), { rounded: true });
  const icoImages = await Promise.all(
    ICO_SIZES.map(async (size) => ({ size, data: await png(faviconTile, size) })),
  );
  await writeFile(join(APP, 'favicon.ico'), ico(icoImages));

  const appTile = tile(mark(SYMBOL_REVERSED_PATH, 0.66, 0.01), { rounded: true });
  await writeFile(join(APP, 'icon.png'), await png(appTile, 512));

  // iOS applies its own corner mask, so the touch icon is full bleed.
  const touchTile = tile(mark(SYMBOL_REVERSED_PATH, 0.64, 0.01), { rounded: false });
  await writeFile(join(APP, 'apple-icon.png'), await png(touchTile, 180));

  console.error('wrote app/icon.svg, app/favicon.ico, app/icon.png, app/apple-icon.png');
}

main().catch((error: unknown) => {
  console.error('Icon generation failed:', error);
  process.exit(1);
});
