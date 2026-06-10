/**
 * Deterministic guard on the JSON-LD builder functions (ticket #61).
 * Self-contained: no DB / network / secrets.
 * Specifically guards the absolute-image-URL fix (regression test for the
 * double-prefix bug where image URLs were incorrectly prepended with APP_URL).
 * Run: npm run test:seo
 */
import { breadcrumbJsonLd, organizationJsonLd, productJsonLd } from '../lib/seo/structured-data';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    process.stdout.write(`  ✓ ${msg}\n`);
  } else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

// --- productJsonLd ---
process.stdout.write('productJsonLd: basic shape and absolute-image-URL fix\n');
{
  const absoluteImageUrl = 'https://images.balikha.art/products/x.jpg';
  const result = productJsonLd({
    name: 'Test Bowl',
    description: 'A handmade bowl',
    images: [absoluteImageUrl],
    sku: 'sku-123',
    brandName: 'Balikha Studio',
    url: 'https://balikha.art/studio/balikha-studio/test-bowl',
    offer: { currency: 'PHP', price: 450, availability: 'InStock' },
  });

  assert(result['@type'] === 'Product', '@type is Product');
  assert(result['@context'] === 'https://schema.org', '@context is https://schema.org');
  assert(result['name'] === 'Test Bowl', 'name is set');

  // Regression guard: image[0] must equal the input absolute URL exactly —
  // no balikha.art/https://… double-prefix.
  const images = result['image'] as string[];
  assert(Array.isArray(images), 'image is an array');
  assert(
    images[0] === absoluteImageUrl,
    'image[0] equals the input absolute URL (no double-prefix)',
  );

  const offers = result['offers'] as Record<string, unknown>;
  assert(offers !== undefined, 'offers is present');
  assert(offers['priceCurrency'] !== undefined, 'offers.priceCurrency is present');
  assert(offers['price'] !== undefined, 'offers.price is present');
  assert(offers['availability'] !== undefined, 'offers.availability is present');
  assert(
    offers['availability'] === 'https://schema.org/InStock',
    "offers.availability is 'https://schema.org/InStock' for availability: 'InStock'",
  );
}

process.stdout.write('productJsonLd: SoldOut and OutOfStock availability mapping\n');
{
  const sold = productJsonLd({
    name: 'Sold Bowl',
    description: null,
    images: [],
    sku: 'sku-sold',
    brandName: 'Studio',
    url: 'https://balikha.art/studio/studio/sold-bowl',
    offer: { currency: 'PHP', price: 100, availability: 'SoldOut' },
  });
  const oos = productJsonLd({
    name: 'OOS Bowl',
    description: null,
    images: [],
    sku: 'sku-oos',
    brandName: 'Studio',
    url: 'https://balikha.art/studio/studio/oos-bowl',
    offer: { currency: 'PHP', price: 100, availability: 'OutOfStock' },
  });
  assert(
    (sold['offers'] as Record<string, unknown>)['availability'] === 'https://schema.org/SoldOut',
    "offers.availability is 'https://schema.org/SoldOut' for availability: 'SoldOut'",
  );
  assert(
    (oos['offers'] as Record<string, unknown>)['availability'] === 'https://schema.org/OutOfStock',
    "offers.availability is 'https://schema.org/OutOfStock' for availability: 'OutOfStock'",
  );
}

process.stdout.write('productJsonLd: showcase works omit offers entirely (T3)\n');
{
  const showcase = productJsonLd({
    name: 'Showcase Bowl',
    description: null,
    images: [],
    sku: 'sku-showcase',
    brandName: 'Studio',
    url: 'https://balikha.art/studio/studio/showcase-bowl',
  });
  assert(showcase['offers'] === undefined, 'offers is undefined when no offer is passed');
  assert(showcase['@type'] === 'Product', '@type is still Product without an offer');
}

// --- organizationJsonLd ---
process.stdout.write('organizationJsonLd: shape, image present/absent, no logo key\n');
{
  const withImage = organizationJsonLd({
    name: 'Balikha Studio',
    url: 'https://balikha.art/studio/balikha-studio',
    description: 'Handmade pottery',
    image: 'https://images.balikha.art/banners/studio.jpg',
  });

  assert(withImage['@type'] === 'Organization', '@type is Organization');
  assert(withImage['name'] === 'Balikha Studio', 'name is set');
  assert(withImage['url'] === 'https://balikha.art/studio/balikha-studio', 'url is set');
  assert(withImage['image'] !== undefined, 'image is present when provided');
  assert(!('logo' in withImage), 'no logo key emitted');

  const noImage = organizationJsonLd({
    name: 'New Shop',
    url: 'https://balikha.art/studio/new-shop',
    description: null,
    image: null,
  });

  assert(noImage['image'] === undefined, 'image omitted when null');
  assert(noImage['description'] === undefined, 'description omitted when null');
  assert(!('logo' in noImage), 'no logo key emitted when image is null');
}

// --- breadcrumbJsonLd ---
process.stdout.write('breadcrumbJsonLd: itemListElement count and positions\n');
{
  // T1: trails are studio-rooted — {Studio name} › {Work title}, no
  // marketplace "Shop" root node.
  const result = breadcrumbJsonLd([
    { name: 'Balikha Studio', url: 'https://balikha.art/studio/balikha-studio' },
    { name: 'Test Bowl', url: 'https://balikha.art/studio/balikha-studio/test-bowl' },
  ]);

  assert(result['@type'] === 'BreadcrumbList', '@type is BreadcrumbList');
  const items = result['itemListElement'] as Array<Record<string, unknown>>;
  assert(Array.isArray(items), 'itemListElement is an array');
  assert(items.length === 2, 'itemListElement has 2 entries');
  assert(items[0]?.['position'] === 1, 'first item position is 1');
  assert(items[1]?.['position'] === 2, 'second item position is 2');
  assert(items[0]?.['name'] === 'Balikha Studio', 'first item name is the studio');
  assert(
    items[0]?.['item'] === 'https://balikha.art/studio/balikha-studio',
    'first item url is the studio page',
  );
  assert(items[1]?.['name'] === 'Test Bowl', 'second item name is the work title');
  assert(
    items[1]?.['item'] === 'https://balikha.art/studio/balikha-studio/test-bowl',
    'second item url matches',
  );
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
process.stdout.write('\nAll structured-data checks passed\n');
