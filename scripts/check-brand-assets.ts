/**
 * Guards the Coil logo assets: the exported path data, the app icon files and
 * the email logo PNG. Self-contained: no DB / network / secrets.
 * Run: npm run test:brand-assets
 */
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import {
  LOCKUP_HEIGHT,
  LOCKUP_VIEWBOX,
  LOCKUP_WIDTH,
  LOCKUP_WORDMARK_PATH,
  SYMBOL_PATH,
  SYMBOL_REVERSED_PATH,
  SYMBOL_SMALL_PATH,
  SYMBOL_SMALL_REVERSED_PATH,
} from '../components/brand/logo-paths';
import { lockupWidth } from '../components/brand/logo';
import {
  EMAIL_LOGO_FILE,
  EMAIL_LOGO_HEIGHT,
  EMAIL_LOGO_SCALE,
  EMAIL_LOGO_WIDTH,
} from '../lib/email/logo';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) process.stdout.write(`  ✓ ${msg}\n`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

// Absolute commands only, and the path ends closed.
const PATH_SHAPE = /^M[-\d\s.MLHVCSQTAZ]+Z$/;

async function main() {
  process.stdout.write('path data\n');
  assert(
    LOCKUP_VIEWBOX.endsWith(` ${LOCKUP_WIDTH} ${LOCKUP_HEIGHT}`),
    'lockup viewBox matches its exported size',
  );
  for (const [name, d] of Object.entries({
    SYMBOL_PATH,
    SYMBOL_SMALL_PATH,
    SYMBOL_REVERSED_PATH,
    SYMBOL_SMALL_REVERSED_PATH,
    LOCKUP_WORDMARK_PATH,
  })) {
    assert(PATH_SHAPE.test(d), `${name} is a closed path of absolute commands`);
  }
  assert(lockupWidth(LOCKUP_HEIGHT) === LOCKUP_WIDTH, 'lockupWidth keeps the lockup proportions');

  process.stdout.write('app icons\n');
  const iconSvg = await readFile('app/icon.svg', 'utf8');
  assert(!iconSvg.includes('<text'), 'icon.svg has no live text');
  assert(iconSvg.includes(`d="${SYMBOL_SMALL_PATH}"`), 'icon.svg draws the small Coil');
  assert(iconSvg.includes('prefers-color-scheme: dark'), 'icon.svg switches colour in dark mode');

  const ico = await readFile('app/favicon.ico');
  const icoCount = ico.readUInt16LE(4);
  const icoSizes = Array.from({ length: icoCount }, (_, index) => {
    const width = ico.readUInt8(6 + index * 16);
    // The ICO directory stores 256 as 0.
    return width === 0 ? 256 : width;
  }).sort((a, b) => a - b);
  assert(
    icoSizes.join(',') === '16,32,48',
    `favicon.ico holds 16, 32 and 48 px (got ${icoSizes.join(', ')})`,
  );

  for (const [file, px] of [
    ['app/icon.png', 512],
    ['app/apple-icon.png', 180],
  ] as const) {
    const meta = await sharp(file).metadata();
    assert(meta.width === px && meta.height === px, `${file} is ${px}x${px}`);
  }

  process.stdout.write('email logo\n');
  const emailLogo = await sharp(`public/${EMAIL_LOGO_FILE}`).metadata();
  assert(
    emailLogo.width === EMAIL_LOGO_WIDTH * EMAIL_LOGO_SCALE &&
      emailLogo.height === EMAIL_LOGO_HEIGHT * EMAIL_LOGO_SCALE,
    `${EMAIL_LOGO_FILE} is rendered at ${EMAIL_LOGO_SCALE}x the display size`,
  );

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  process.stdout.write('\nAll brand asset checks passed\n');
}

main().catch((error: unknown) => {
  console.error('Brand asset check crashed:', error);
  process.exit(1);
});
