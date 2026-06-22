// Generates Balikha's favicon set from the brand tokens (DESIGN.md).
//
// The mark: a cream serif "B" — the Fraunces wordmark compressed into one
// glyph — on a Deep Sea Navy rounded square. Cream-on-navy follows the
// "Navy-Carries-the-Click" rule and stays legible at 16px. The glyph is
// optically centered by measuring its rendered pixel bounding box.
//
// Run: node scripts/generate-favicon.mjs
// Outputs: app/icon.svg, app/icon.png, app/apple-icon.png, app/favicon.ico
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'app');

// Brand tokens
const NAVY = '#1A2B3A'; // Deep Sea Navy — the field
const CREAM = '#FDFCF7'; // Sampaguita Cream — the letter
const FONT = "Fraunces, Georgia, 'Times New Roman', serif";

const MASTER = 512;
const RADIUS = 112; // ~22% — soft tile, in the brand's rounded family
const FONT_SIZE = 360;
const FONT_WEIGHT = 500;

function svg({ dx = 0, dy = 0 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MASTER} ${MASTER}" width="${MASTER}" height="${MASTER}">
  <rect width="${MASTER}" height="${MASTER}" rx="${RADIUS}" fill="${NAVY}"/>
  <g transform="translate(${dx} ${dy})">
    <text x="${MASTER / 2}" y="${MASTER / 2}" dominant-baseline="central" text-anchor="middle" font-family="${FONT}" font-size="${FONT_SIZE}" font-weight="${FONT_WEIGHT}" fill="${CREAM}">B</text>
  </g>
</svg>`;
}

// Measure the glyph's pixel bounding box so we can optically center it.
async function measure(svgStr) {
  const { data, info } = await sharp(Buffer.from(svgStr))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width,
    minY = height,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      // cream pixels are bright on all channels; navy is dark
      if (data[i] > 160 && data[i + 1] > 160 && data[i + 2] > 150) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

const probe = await measure(svg());
const cx = (probe.minX + probe.maxX) / 2;
const cy = (probe.minY + probe.maxY) / 2;
const dx = Math.round(MASTER / 2 - cx);
const dy = Math.round(MASTER / 2 - cy);
console.log('glyph bbox', probe, '→ centering offset', { dx, dy });

const finalSvg = svg({ dx, dy });
await writeFile(join(APP, 'icon.svg'), finalSvg);

const png = (size) => sharp(Buffer.from(finalSvg)).resize(size, size).png();

await png(512).toFile(join(APP, 'icon.png'));
await png(180).toFile(join(APP, 'apple-icon.png'));

// Assemble a multi-resolution favicon.ico (PNG-embedded ICO).
const icoSizes = [16, 32, 48];
const pngs = await Promise.all(icoSizes.map((s) => png(s).toBuffer()));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(icoSizes.length, 4); // image count
const entries = [];
let offset = 6 + icoSizes.length * 16;
icoSizes.forEach((size, idx) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size >= 256 ? 0 : size, 0);
  e.writeUInt8(size >= 256 ? 0 : size, 1);
  e.writeUInt8(0, 2); // palette
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // color planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(pngs[idx].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[idx].length;
  entries.push(e);
});
await writeFile(join(APP, 'favicon.ico'), Buffer.concat([header, ...entries, ...pngs]));

// Preview contact sheet: 16 and 32 shown at actual size and zoomed.
const sheet = await sharp({
  create: {
    width: 360,
    height: 140,
    channels: 4,
    background: { r: 238, g: 233, b: 221, alpha: 1 }, // Oat
  },
})
  .composite([
    { input: await png(16).toBuffer(), left: 20, top: 20 },
    { input: await png(32).toBuffer(), left: 60, top: 20 },
    {
      input: await png(16).resize(128, 128, { kernel: 'nearest' }).toBuffer(),
      left: 120,
      top: 6,
    },
    { input: await png(96).toBuffer(), left: 256, top: 22 },
  ])
  .png()
  .toBuffer();
await writeFile(join(ROOT, '_favicon_preview.png'), sheet);
console.log('wrote app/icon.svg, app/icon.png, app/apple-icon.png, app/favicon.ico');
console.log('preview → _favicon_preview.png');
