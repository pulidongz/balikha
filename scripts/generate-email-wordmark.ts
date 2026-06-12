// One-time generator for the email wordmark: renders "Balikha" in real
// Fraunces to a transparent PNG so email clients that strip webfonts
// (Gmail, Outlook) still show the brand serif. Output is committed;
// re-run only when the wordmark changes.
//
// Fraunces TTF is fetched at script time from Google Fonts. The css2
// endpoint serves TTF source URLs when the request has no browser UA.
import { writeFile, mkdir } from 'node:fs/promises';
import satori from 'satori';
import { createElement } from 'satori/jsx';
import sharp from 'sharp';

const CSS_URL = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500';
const OUT_PATH = 'public/email/wordmark-cream.png';
// 2x asset: rendered at 44px cap height, displayed at 22px in the band.
const FONT_SIZE = 44;

async function fetchFrauncesTtf(): Promise<ArrayBuffer> {
  const css = await fetch(CSS_URL, { headers: { 'User-Agent': '' } }).then((r) => {
    if (!r.ok) throw new Error(`Fonts CSS fetch failed: ${r.status}`);
    return r.text();
  });
  const match = css.match(/src: url\((https:[^)]+\.ttf)\)/);
  const ttfUrl = match?.[1];
  if (!ttfUrl) throw new Error('No TTF URL found in fonts CSS — UA trick may have stopped working');
  const ttf = await fetch(ttfUrl);
  if (!ttf.ok) throw new Error(`TTF fetch failed: ${ttf.status}`);
  return ttf.arrayBuffer();
}

async function main() {
  const fontData = await fetchFrauncesTtf();
  const svg = await satori(
    createElement(
      'div',
      {
        style: {
          display: 'flex',
          color: '#FDFCF7',
          fontFamily: 'Fraunces',
          fontSize: FONT_SIZE,
          fontWeight: 500,
          letterSpacing: '-0.01em',
        },
      },
      'Balikha',
    ),
    {
      // Generous box; transparent edges are trimmed with sharp below.
      width: 400,
      height: 80,
      fonts: [{ name: 'Fraunces', data: fontData, weight: 500, style: 'normal' }],
    },
  );
  await mkdir('public/email', { recursive: true });
  const png = await sharp(Buffer.from(svg)).trim().png().toBuffer();
  const meta = await sharp(png).metadata();
  await writeFile(OUT_PATH, png);
  console.error(`wrote ${OUT_PATH} (${meta.width}x${meta.height})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
