// Deterministic, idempotent seed.
// Run via `npm run db:seed` or `npm run db:reset` (which schema-pushes first).
//
// What this creates:
// - 1 admin account (admin@balikha.art / password123) — no artisan profile.
// - 10 sellers, each with their own craft and 20 products = 200 products total.
//   Status mix: ~75% published, ~10% sold_out, ~10% draft, ~5% archived.
//   Image counts vary 0–4 per product. ~600 images total.
// - 10 buyer accounts (buyer1@…@balikha.art through buyer10@…/password123).
// - Each product image is a real binary uploaded to MinIO with a unique
//   storage_key. The image bytes come from a pool of 50 unique placeholder
//   photos fetched from picsum.photos (cached on disk so re-runs are fast).
//
// Idempotency: every run wipes the bucket AND the DB, then re-creates from
// scratch. Safe to run twice.
//
// Env loading: invoked via `tsx --env-file=.env.development`, so process.env
// is populated before any module evaluates. Don't add dotenv.config() here —
// ESM hoists imports, and `@/db` (→ `@/env`) would run before any inline
// config() call.

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { faker } from '@faker-js/faker';
import { eq, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { account, session, user, verification } from '@/db/schema/auth';
import {
  artisanProfiles,
  catalogs,
  orderDisputes,
  orderEvents,
  orders,
  productImages,
  products,
} from '@/db/schema/app';
import { logger } from '@/lib/logger';
import { splitFullName } from '@/lib/name';
import { slugify, uniqueSlug } from '@/lib/slug';
import { BUCKET, PUBLIC_URL_BASE, s3 } from '@/lib/storage/client';

faker.seed(42);

// --- Configuration ----------------------------------------------------------

const ADMIN = { email: 'admin@balikha.art', password: 'password123', name: 'Admin' };
const TEST_PASSWORD = 'password123';
const NUM_BUYERS = 10;
const PRODUCTS_PER_SELLER = 20;
const UNIQUE_IMAGE_POOL = 50;
const IMAGE_FETCH_CONCURRENCY = 8;
const IMAGE_CACHE_DIR = path.join(os.tmpdir(), 'balikha-seed-images');

// --- Sellers ----------------------------------------------------------------

type Craft =
  | 'pottery'
  | 'weaves'
  | 'wood'
  | 'silver'
  | 'leather'
  | 'glass'
  | 'soap'
  | 'textiles'
  | 'paper'
  | 'coffee';

interface SellerSeed {
  email: string;
  name: string;
  shopName: string;
  shopSlug: string;
  bio: string;
  location: string;
  craft: Craft;
}

const SELLERS: SellerSeed[] = [
  {
    email: 'maria@balikha.art',
    name: 'Maria Santos',
    shopName: 'Maria Ceramics',
    shopSlug: 'maria-ceramics',
    bio: 'Hand-thrown stoneware and porcelain from a small studio in Quezon City. Each piece is one-of-a-kind, made with locally sourced clay and fired in a small electric kiln.',
    location: 'Quezon City',
    craft: 'pottery',
  },
  {
    email: 'tboli@balikha.art',
    name: "T'boli Collective",
    shopName: "T'boli Weaves",
    shopSlug: 'tboli-weaves',
    bio: "Traditional T'nalak weaves from South Cotabato, made by a collective of women weavers preserving generations-old techniques with abaca fiber and natural dyes.",
    location: 'Lake Sebu, South Cotabato',
    craft: 'weaves',
  },
  {
    email: 'narra@balikha.art',
    name: 'Junnie Narra',
    shopName: 'Narra Studio',
    shopSlug: 'narra-studio',
    bio: 'Hand-carved bowls and serving boards from sustainably harvested narra and acacia. Working out of a small workshop in Baguio.',
    location: 'Baguio',
    craft: 'wood',
  },
  {
    email: 'kapinunan@balikha.art',
    name: 'Esperanza Reyes',
    shopName: 'Kapinunan Silver',
    shopSlug: 'kapinunan-silver',
    bio: 'Hand-forged silver jewelry from a tiny atelier in Cebu, drawing on traditional baybayin and pre-colonial motifs.',
    location: 'Cebu City',
    craft: 'silver',
  },
  {
    email: 'pasig-leather@balikha.art',
    name: 'Ronaldo Cruz',
    shopName: 'Pasig Leatherworks',
    shopSlug: 'pasig-leatherworks',
    bio: 'Vegetable-tanned leather goods, hand-stitched with linen thread. Built to age, not to be replaced.',
    location: 'Pasig',
    craft: 'leather',
  },
  {
    email: 'banwa-glass@balikha.art',
    name: 'Liza Tomas',
    shopName: 'Banwa Glass',
    shopSlug: 'banwa-glass',
    bio: 'Hand-blown glassware from recycled bottles and offcuts, made in a converted barn outside Iloilo.',
    location: 'Iloilo',
    craft: 'glass',
  },
  {
    email: 'davao-dipping@balikha.art',
    name: 'Apolinario Velasco',
    shopName: 'Davao Dipping Co.',
    shopSlug: 'davao-dipping-co',
    bio: 'Cold-process soap and pure-essential-oil candles, scented with locally distilled botanicals from Mindanao.',
    location: 'Davao',
    craft: 'soap',
  },
  {
    email: 'hablon@balikha.art',
    name: 'Cecilia Aquino',
    shopName: 'Hablon Heritage',
    shopSlug: 'hablon-heritage',
    bio: 'Heirloom hablon textiles from Iloilo, woven on antique foot looms in patterns passed down through five generations.',
    location: 'Iloilo',
    craft: 'textiles',
  },
  {
    email: 'lola-letras@balikha.art',
    name: 'Imelda Bautista',
    shopName: 'Lola Letras',
    shopSlug: 'lola-letras',
    bio: 'Hand-bound notebooks, broadsides, and letterpress cards out of a small studio in Vigan.',
    location: 'Vigan',
    craft: 'paper',
  },
  {
    email: 'sagada-roasters@balikha.art',
    name: 'Lakan Pulido',
    shopName: 'Sagada Roasters',
    shopSlug: 'sagada-roasters',
    bio: 'Single-origin coffee from Cordillera growers, small-batch roasted weekly in Sagada.',
    location: 'Sagada',
    craft: 'coffee',
  },
];

// --- Per-craft product templates -------------------------------------------

const TEMPLATES: Record<Craft, { types: string[]; materials: string[]; adjectives: string[] }> = {
  pottery: {
    types: ['vase', 'bowl', 'mug', 'plate', 'pitcher', 'teapot', 'planter', 'cup', 'jar', 'dish'],
    materials: [
      'stoneware',
      'porcelain',
      'earthenware',
      'terracotta',
      'ash glaze',
      'celadon glaze',
    ],
    adjectives: ['Hand-thrown', 'Wheel-thrown', 'Slab-built', 'Hand-pinched', 'Rustic'],
  },
  weaves: {
    types: [
      'runner',
      'placemat set',
      'wall hanging',
      'cushion cover',
      'throw',
      'tote',
      'sash',
      'bookmark',
      'tablecloth',
      'panel',
    ],
    materials: ['abaca fiber', 'natural dye', 'cotton warp', 'silk weft'],
    adjectives: ['T’nalak', 'Backstrap-woven', 'Hand-loomed', 'Heirloom', 'Traditional'],
  },
  wood: {
    types: [
      'bowl',
      'cutting board',
      'spoon',
      'tray',
      'coaster set',
      'serving plate',
      'pestle',
      'spatula',
      'utensil rest',
      'side board',
    ],
    materials: ['narra wood', 'acacia wood', 'mahogany', 'food-safe finish', 'beeswax finish'],
    adjectives: ['Hand-carved', 'Lathe-turned', 'Reclaimed', 'Solid', 'Heirloom'],
  },
  silver: {
    types: [
      'ring',
      'pendant',
      'earring pair',
      'bracelet',
      'cuff',
      'pin',
      'brooch',
      'necklace',
      'bangle',
      'charm',
    ],
    materials: [
      'sterling silver',
      'oxidized silver',
      'hand-engraved detail',
      'mother of pearl',
      'baybayin script',
    ],
    adjectives: ['Hand-forged', 'Hammered', 'Engraved', 'Cast', 'Wire-wrapped'],
  },
  leather: {
    types: [
      'wallet',
      'belt',
      'cardholder',
      'keychain',
      'satchel',
      'tote',
      'pouch',
      'journal cover',
      'watch strap',
      'luggage tag',
    ],
    materials: [
      'vegetable-tanned leather',
      'linen thread',
      'brass hardware',
      'natural edge finish',
    ],
    adjectives: ['Hand-stitched', 'Hand-cut', 'Saddle-stitched', 'Edge-burnished', 'Minimal'],
  },
  glass: {
    types: [
      'tumbler',
      'vase',
      'bowl',
      'plate',
      'paperweight',
      'bottle',
      'candle holder',
      'ornament',
      'decanter',
      'pitcher',
    ],
    materials: ['recycled glass', 'borosilicate', 'soda-lime glass', 'sand-cast'],
    adjectives: ['Hand-blown', 'Free-blown', 'Mold-blown', 'Recycled', 'Sculpted'],
  },
  soap: {
    types: [
      'bar',
      'scrub',
      'balm',
      'travel set',
      'candle',
      'sachet',
      'salt scrub',
      'gift set',
      'face oil',
      'lip balm',
    ],
    materials: [
      'coconut oil',
      'lemongrass essential oil',
      'mango butter',
      'beeswax',
      'kaffir lime',
    ],
    adjectives: ['Cold-process', 'Small-batch', 'Hand-poured', 'Botanical', 'Pure'],
  },
  textiles: {
    types: [
      'scarf',
      'shawl',
      'wrap',
      'blouse panel',
      'runner',
      'placemat',
      'kitchen towel',
      'napkin set',
      'curtain panel',
      'cushion cover',
    ],
    materials: ['hablon weave', 'cotton', 'piña fiber', 'natural dye'],
    adjectives: ['Loom-woven', 'Heirloom', 'Hand-loomed', 'Traditional', 'Indigo-dyed'],
  },
  paper: {
    types: [
      'notebook',
      'journal',
      'sketchbook',
      'card set',
      'broadside print',
      'planner',
      'bookmark',
      'gift tag',
      'envelope set',
      'monthly calendar',
    ],
    materials: ['handmade paper', 'cotton thread binding', 'letterpress ink', 'kraft cover'],
    adjectives: ['Hand-bound', 'Letterpress-printed', 'Smyth-sewn', 'Long-stitch', 'Saddle-stitch'],
  },
  coffee: {
    types: [
      '250g bag',
      '500g bag',
      '1kg bag',
      'cold brew kit',
      'drip set',
      'espresso blend',
      'single-origin lot',
      'pour-over filters',
      'gift box',
      'sampler set',
    ],
    materials: ['Cordillera arabica', 'Sagada heirloom', 'medium roast', 'dark roast'],
    adjectives: ['Single-origin', 'Small-batch', 'Slow-roasted', 'Whole-bean', 'Freshly-roasted'],
  },
};

const DESCRIPTION_OPENERS: Record<Craft, string[]> = {
  pottery: [
    'Wheel-thrown by hand and finished with a soft matte glaze.',
    'A one-of-a-kind piece from a small studio. Subtle variations are part of the charm.',
    'Hand-built and fired in a small electric kiln; locally sourced clay throughout.',
  ],
  weaves: [
    'Woven on a backstrap loom from abaca fiber dyed with natural pigments.',
    'Each pattern carries traditional meaning passed down through generations of weavers.',
    'A piece of heritage textile work from a women’s collective in South Cotabato.',
  ],
  wood: [
    'Hand-carved from a single block, finished with a food-safe oil and beeswax mix.',
    'Sustainably harvested wood worked entirely by hand. Each piece develops a patina over time.',
    'Lathe-turned in a small workshop; the grain is what makes it.',
  ],
  silver: [
    'Hand-forged in a small atelier, then hand-finished. Stamps with the maker’s mark.',
    'Each piece is made one at a time — no two are exactly alike.',
    'Solid sterling silver, hammered and oxidized for depth.',
  ],
  leather: [
    'Vegetable-tanned full-grain leather, saddle-stitched by hand with waxed linen.',
    'Built to last and to age. Will develop a patina with use.',
    'Hand-cut and edge-burnished in our Pasig workshop.',
  ],
  glass: [
    'Free-blown from recycled bottle glass — every bubble is intentional.',
    'Made in small batches. Slight asymmetry is the signature of hand-blown work.',
    'Heat-treated for everyday use. Dishwasher safe with care.',
  ],
  soap: [
    'Cold-process soap cured for a minimum of 6 weeks. Scented with pure essential oils.',
    'Made in small batches with locally sourced botanicals from Mindanao.',
    'Free of synthetic fragrance, palm oil, and animal products.',
  ],
  textiles: [
    'Loom-woven from hablon and finished by hand. A piece of Iloilo heritage.',
    'Each panel is woven on antique foot looms; the pattern is heirloom.',
    'Naturally dyed with locally foraged plants — colors deepen with washing.',
  ],
  paper: [
    'Hand-bound with cotton thread on handmade paper. Lays flat when open.',
    'Letterpress-printed in small editions on archival cotton paper.',
    'A small-edition piece from our Vigan studio.',
  ],
  coffee: [
    'Single-origin from Cordillera growers, roasted within the past week.',
    'Small-batch roasted in Sagada. Best within 30 days of roast.',
    'Tasting notes change subtly with the harvest. We list the current notes on the bag.',
  ],
};

// --- Helpers ---------------------------------------------------------------

async function clearBucket(): Promise<void> {
  let continuationToken: string | undefined;
  let total = 0;
  do {
    const list = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: continuationToken }),
    );
    const keys = list.Contents?.map((o) => o.Key).filter((k): k is string => Boolean(k)) ?? [];
    if (keys.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: { Objects: keys.map((Key) => ({ Key })) },
        }),
      );
      total += keys.length;
    }
    continuationToken = list.NextContinuationToken;
  } while (continuationToken);
  if (total > 0) logger.info({ deleted: total }, 'Cleared MinIO bucket');
}

async function clearDb(): Promise<void> {
  // Order matters — children before parents.
  // order_events and order_disputes cascade from orders, but we delete
  // explicitly to keep the order obvious to readers (and resilient if a
  // future schema change weakens the cascade).
  await db.delete(orderEvents);
  await db.delete(orderDisputes);
  await db.delete(orders);
  await db.delete(productImages);
  await db.delete(products);
  await db.delete(catalogs);
  await db.delete(artisanProfiles);
  await db.delete(session);
  await db.delete(account);
  await db.delete(verification);
  await db.delete(user);
}

async function fetchCachedImage(seedKey: string): Promise<Buffer> {
  const cacheFile = path.join(IMAGE_CACHE_DIR, `${seedKey}.jpg`);
  try {
    return await fs.readFile(cacheFile);
  } catch {
    const url = `https://picsum.photos/seed/${seedKey}/800/1000`;
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`picsum.photos fetch failed for ${seedKey}: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.mkdir(IMAGE_CACHE_DIR, { recursive: true });
    await fs.writeFile(cacheFile, buf);
    return buf;
  }
}

async function preloadImagePool(): Promise<Buffer[]> {
  logger.info(
    { pool: UNIQUE_IMAGE_POOL, cacheDir: IMAGE_CACHE_DIR },
    'Preloading image pool (cached on disk; first run is slow, re-runs are fast)…',
  );
  const buffers: Buffer[] = new Array(UNIQUE_IMAGE_POOL);
  for (let start = 0; start < UNIQUE_IMAGE_POOL; start += IMAGE_FETCH_CONCURRENCY) {
    const end = Math.min(start + IMAGE_FETCH_CONCURRENCY, UNIQUE_IMAGE_POOL);
    await Promise.all(
      Array.from({ length: end - start }, (_, k) => start + k).map(async (i) => {
        buffers[i] = await fetchCachedImage(`balikha-${i}`);
      }),
    );
  }
  return buffers;
}

async function uploadProductImage(buffer: Buffer, productId: string): Promise<string> {
  const key = `products/${productId}/${randomUUID()}.jpg`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg',
      ContentLength: buffer.length,
    }),
  );
  return key;
}

async function createUser(email: string, password: string, name: string) {
  const { firstName, lastName } = splitFullName(name);
  const result = await auth.api.signUpEmail({
    body: { email, password, name, firstName, lastName: lastName ?? '' },
  });
  if (!result.user) throw new Error(`Failed to create user ${email}`);
  return result.user;
}

function pickStatus(): 'draft' | 'published' | 'sold_out' | 'archived' {
  const r = faker.number.int({ min: 0, max: 19 });
  if (r < 15) return 'published'; // 75%
  if (r < 17) return 'sold_out'; //  10%
  if (r < 19) return 'draft'; //     10%
  return 'archived'; //              5%
}

function buildProductTitle(craft: Craft, productIndex: number): string {
  const t = TEMPLATES[craft];
  const type = t.types[productIndex % t.types.length]!;
  const adj = faker.helpers.arrayElement(t.adjectives);
  const material = faker.helpers.arrayElement(t.materials);
  // Append index to keep slugs unique within an artisan even when the
  // adj/material/type combo collides.
  return `${adj} ${material} ${type} #${productIndex + 1}`;
}

function buildDescription(craft: Craft): string {
  const opener = faker.helpers.arrayElement(DESCRIPTION_OPENERS[craft]);
  return `${opener} ${faker.lorem.sentences({ min: 2, max: 4 })}`;
}

function buildMaterials(craft: Craft): string[] {
  const pool = TEMPLATES[craft].materials;
  const count = faker.number.int({ min: 1, max: Math.min(4, pool.length) });
  return faker.helpers.arrayElements(pool, count);
}

// --- Main ------------------------------------------------------------------

async function seed() {
  logger.info('Clearing MinIO bucket…');
  await clearBucket();

  logger.info('Clearing database…');
  await clearDb();

  // Preload images upfront so per-product image loops are pure CPU + uploads
  const imagePool = await preloadImagePool();
  let imagePoolCursor = 0;
  const nextImage = (): Buffer => imagePool[imagePoolCursor++ % imagePool.length]!;

  const seededUserIds: string[] = [];

  // Admin (no artisan profile) — special password per the spec
  logger.info({ email: ADMIN.email }, 'Creating admin account…');
  const adminUser = await createUser(ADMIN.email, ADMIN.password, ADMIN.name);
  seededUserIds.push(adminUser.id);
  await db.update(user).set({ role: 'admin' }).where(eq(user.id, adminUser.id));

  // Buyer accounts (no artisan profile)
  logger.info({ count: NUM_BUYERS }, 'Creating buyer accounts…');
  for (let i = 1; i <= NUM_BUYERS; i++) {
    const buyer = await createUser(`buyer${i}@balikha.art`, TEST_PASSWORD, faker.person.fullName());
    seededUserIds.push(buyer.id);
  }

  // Sellers
  let totalProducts = 0;
  let totalImages = 0;

  for (let s = 0; s < SELLERS.length; s++) {
    const seller = SELLERS[s]!;
    logger.info({ shop: seller.shopName, idx: s + 1, total: SELLERS.length }, 'Seeding seller…');

    const created = await createUser(seller.email, TEST_PASSWORD, seller.name);
    seededUserIds.push(created.id);

    // Promote Maria to admin so /admin is reachable immediately after seeding.
    if (seller.email === 'maria@balikha.art') {
      await db.update(user).set({ role: 'admin' }).where(eq(user.id, created.id));
      logger.info({ email: seller.email }, 'Promoted seller to admin');
    }

    const [profile] = await db
      .insert(artisanProfiles)
      .values({
        userId: created.id,
        shopSlug: seller.shopSlug,
        shopName: seller.shopName,
        bio: seller.bio,
        location: seller.location,
        // Seeded sellers are approved so their directly-inserted `published`
        // products below are consistent with the approval gate (Task 1.1).
        approvalStatus: 'approved',
      })
      .returning();
    if (!profile) throw new Error('Failed to create artisan profile');

    const [defaultCatalog] = await db
      .insert(catalogs)
      .values({
        artisanProfileId: profile.id,
        slug: 'shop',
        title: 'Shop',
        status: 'published',
      })
      .returning();
    if (!defaultCatalog) throw new Error('Failed to create catalog');

    // Optional limited-drop catalog for the first 3 sellers — exercises the
    // release/closes window UI and the "Limited" badge.
    let limitedCatalog: typeof defaultCatalog | null = null;
    if (s < 3) {
      const [drop] = await db
        .insert(catalogs)
        .values({
          artisanProfileId: profile.id,
          slug: 'holiday-2026',
          title: 'Holiday 2026',
          description: `Limited holiday pieces from ${seller.shopName}, available through December.`,
          status: 'published',
          releaseAt: new Date('2026-11-15'),
          closesAt: new Date('2026-12-24'),
        })
        .returning();
      limitedCatalog = drop ?? null;
    }

    // In-process tracker for slugs we've already generated for this seller.
    // The new uniqueSlug API takes an async exists() callback — perfect fit;
    // we just check the set instead of hitting the DB (the seed inserts
    // sequentially, so the in-memory set is always current).
    const slugSet = new Set<string>();

    for (let p = 0; p < PRODUCTS_PER_SELLER; p++) {
      const status = pickStatus();
      const title = buildProductTitle(seller.craft, p);
      const slug = await uniqueSlug(title, async (candidate) => slugSet.has(candidate));
      slugSet.add(slug);

      const stockOnHand = status === 'sold_out' ? 0 : faker.number.int({ min: 0, max: 12 });
      const price = faker.commerce.price({ min: 250, max: 8500, dec: 2 });

      // ~5% of products have no images (edge case); rest have 1–4
      const imageCount =
        faker.number.int({ min: 0, max: 100 }) < 5 ? 0 : faker.number.int({ min: 1, max: 4 });

      // Place the last product in the limited catalog if one exists
      const targetCatalog =
        limitedCatalog && p === PRODUCTS_PER_SELLER - 1 ? limitedCatalog : defaultCatalog;

      const [product] = await db
        .insert(products)
        .values({
          catalogId: targetCatalog.id,
          artisanProfileId: profile.id,
          slug,
          title,
          description: buildDescription(seller.craft),
          price,
          currency: 'PHP',
          stockOnHand,
          status,
          materials: buildMaterials(seller.craft),
        })
        .returning();
      if (!product) throw new Error('Failed to create product');
      totalProducts++;

      // Upload images sequentially for this product (fast since images are
      // already in memory). Sequential keeps positions monotonic.
      for (let img = 0; img < imageCount; img++) {
        const buffer = nextImage();
        const storageKey = await uploadProductImage(buffer, product.id);
        await db.insert(productImages).values({
          productId: product.id,
          storageKey,
          url: `${PUBLIC_URL_BASE}/${storageKey}`,
          altText: title,
          position: img,
          width: 800,
          height: 1000,
        });
        totalImages++;
      }
    }
  }

  await db.update(user).set({ emailVerified: true }).where(inArray(user.id, seededUserIds));
  logger.info(
    { count: seededUserIds.length },
    'Marked seeded accounts as email-verified for local dev gating.',
  );

  logger.info(
    {
      sellers: SELLERS.length,
      buyers: NUM_BUYERS,
      products: totalProducts,
      images: totalImages,
    },
    'Seed complete.',
  );

  logger.info('--- Test credentials ---');
  logger.info(`Admin:  ${ADMIN.email} / ${ADMIN.password}`);
  for (const seller of SELLERS) {
    const label = seller.email === 'maria@balikha.art' ? 'Seller (admin):' : 'Seller:        ';
    logger.info(`${label} ${seller.email} / ${TEST_PASSWORD}  (${seller.shopName})`);
  }
  logger.info(
    `Buyers: buyer1@balikha.art through buyer${NUM_BUYERS}@balikha.art / ${TEST_PASSWORD}`,
  );
}

// Marked as void use to satisfy ts when slugify isn't otherwise referenced
void slugify;

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error({ err: e }, 'Seed failed');
    process.exit(1);
  });
