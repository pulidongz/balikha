// Deterministic, idempotent seed. Run via `npm run db:seed` or
// `npm run db:reset` (which schema-pushes first).
//
// Edge cases intentionally seeded:
// - Product with zero stock + sold_out status
// - Product in draft (should NOT appear publicly)
// - Product with no images
// - Product with very long description
// - Product with empty description
// - Product with max-length materials list
// - Catalog with release/closes window (Limited drop)
// - Catalog with archived status (separate test for archival flow)
//
// Test credentials are logged at the end — single source of truth.
//
// Env loading: this script is invoked via `tsx --env-file=.env.development`,
// so process.env is populated before any module evaluates. Don't add
// dotenv.config() here — ESM hoists imports, and `@/db` (which imports
// `@/env`) would run before any inline config() call.

import { db } from '@/db';
import { account, session, user, verification } from '@/db/schema/auth';
import {
  artisanProfiles,
  catalogs,
  productImages,
  products,
} from '@/db/schema/app';
import { faker } from '@faker-js/faker';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { slugify } from '@/lib/slug';

faker.seed(42);

const TEST_PASSWORD = 'password123'; // dev only

async function clear() {
  // Order matters — children before parents
  await db.delete(productImages);
  await db.delete(products);
  await db.delete(catalogs);
  await db.delete(artisanProfiles);
  await db.delete(session);
  await db.delete(account);
  await db.delete(verification);
  await db.delete(user);
}

async function createUser(email: string, password: string, name: string) {
  const result = await auth.api.signUpEmail({
    body: { email, password, name },
  });
  if (!result.user) throw new Error(`Failed to create user ${email}`);
  return result.user;
}

const placeholderImage = (text: string) =>
  `https://placehold.co/800x1000/EFE9DC/1A2B3A?text=${encodeURIComponent(text)}`;

interface ArtisanSeed {
  email: string;
  name: string;
  shopName: string;
  bio: string;
  location: string;
}

const ARTISANS: ArtisanSeed[] = [
  {
    email: 'maria@balikha.test',
    name: 'Maria Santos',
    shopName: 'Maria Ceramics',
    bio: 'Hand-thrown stoneware and porcelain from a small studio in Quezon City. Each piece is one-of-a-kind, made with locally sourced clay and fired in a small electric kiln.',
    location: 'Quezon City',
  },
  {
    email: 'tboli@balikha.test',
    name: "T'boli Collective",
    shopName: "T'boli Weaves",
    bio: "Traditional T'nalak weaves from South Cotabato, made by a collective of women weavers preserving generations-old techniques with abaca fiber and natural dyes.",
    location: 'Lake Sebu, South Cotabato',
  },
  {
    email: 'narra@balikha.test',
    name: 'Junnie Narra',
    shopName: 'Narra Studio',
    bio: 'Hand-carved bowls and serving boards from sustainably harvested narra and acacia. Working out of a small workshop in Baguio.',
    location: 'Baguio',
  },
];

interface ProductSeed {
  title: string;
  description: string;
  price: string;
  stockOnHand: number;
  status: 'draft' | 'published' | 'sold_out' | 'archived';
  materials: string[];
  imageCount: number;
}

function buildProductsFor(artisanIndex: number): ProductSeed[] {
  switch (artisanIndex) {
    case 0: // Maria Ceramics — exercises stock/status edge cases
      return [
        {
          title: 'Hand-thrown stoneware vase with ash glaze',
          description:
            'A tall, hand-thrown vase finished in a pale ash glaze. Each piece varies subtly — this one has gentle ridges from the throwing process and a soft matte finish.',
          price: '2400.00',
          stockOnHand: 1,
          status: 'published',
          materials: ['stoneware', 'ash glaze'],
          imageCount: 3,
        },
        {
          title: 'Tea bowl set (pair)',
          description: 'Two matched tea bowls, glazed in deep cobalt.',
          price: '880.00',
          stockOnHand: 0,
          status: 'sold_out',
          materials: ['stoneware', 'cobalt glaze'],
          imageCount: 2,
        },
        {
          title: 'Glazed dinner plate',
          description: '',
          price: '1200.00',
          stockOnHand: 6,
          status: 'published',
          materials: ['porcelain'],
          imageCount: 1,
        },
        {
          title: 'Mug, raw clay finish (work in progress, not yet for sale)',
          description: faker.lorem.paragraphs(4),
          price: '650.00',
          stockOnHand: 0,
          status: 'draft',
          materials: ['stoneware'],
          imageCount: 0,
        },
        {
          title: 'Limited edition gold-rimmed bowl',
          description:
            'A small batch of bowls finished with a hand-painted gold rim.',
          price: '3200.00',
          stockOnHand: 3,
          status: 'published',
          materials: [
            'porcelain',
            'gold luster',
            'hand-painted detail',
            'food-safe glaze',
            'kiln-fired',
          ],
          imageCount: 4,
        },
      ];
    case 1: // T'boli Weaves
      return [
        {
          title: "T'nalak table runner, traditional pattern",
          description:
            "A 1.8m table runner woven from abaca fiber and dyed with natural pigments. Each pattern carries traditional meaning passed down through generations.",
          price: '4500.00',
          stockOnHand: 2,
          status: 'published',
          materials: ['abaca fiber', 'natural dye'],
          imageCount: 3,
        },
        {
          title: "T'nalak placemats (set of 4)",
          description: 'Four matched placemats in earth tones.',
          price: '2200.00',
          stockOnHand: 5,
          status: 'published',
          materials: ['abaca fiber'],
          imageCount: 2,
        },
        {
          title: 'Archived: vintage runner',
          description: 'No longer available — kept for reference.',
          price: '5000.00',
          stockOnHand: 0,
          status: 'archived',
          materials: ['abaca'],
          imageCount: 1,
        },
      ];
    case 2: // Narra Studio
      return [
        {
          title: 'Narra serving bowl, hand-carved',
          description:
            'A deep serving bowl carved from a single piece of narra.',
          price: '1800.00',
          stockOnHand: 4,
          status: 'published',
          materials: ['narra wood', 'food-safe finish'],
          imageCount: 3,
        },
        {
          title: 'Acacia cutting board, large',
          description: 'A 40x25cm cutting board with a beveled edge.',
          price: '2400.00',
          stockOnHand: 2,
          status: 'published',
          materials: ['acacia wood', 'mineral oil finish'],
          imageCount: 2,
        },
      ];
    default:
      return [];
  }
}

async function seed() {
  logger.info('Clearing existing data…');
  await clear();

  logger.info('Creating buyer test account…');
  await createUser('buyer@balikha.test', TEST_PASSWORD, 'Test Buyer');

  for (let i = 0; i < ARTISANS.length; i++) {
    const a = ARTISANS[i]!;
    logger.info({ shop: a.shopName }, 'Creating artisan…');

    const created = await createUser(a.email, TEST_PASSWORD, a.name);

    const [profile] = await db
      .insert(artisanProfiles)
      .values({
        userId: created.id,
        shopSlug: slugify(a.shopName),
        shopName: a.shopName,
        bio: a.bio,
        location: a.location,
      })
      .returning();
    if (!profile) throw new Error('Failed to create artisan profile');

    // Default catalog (auto-created in real app by becomeArtisanAction)
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

    // Optional limited drop catalog for the first artisan — exercises the
    // release/close window code path and the "Limited" badge.
    let limitedCatalog: typeof defaultCatalog | null = null;
    if (i === 0) {
      const [drop] = await db
        .insert(catalogs)
        .values({
          artisanProfileId: profile.id,
          slug: 'holiday-2026',
          title: 'Holiday 2026',
          description: 'Limited holiday pieces, available through December.',
          status: 'published',
          releaseAt: new Date('2026-11-15'),
          closesAt: new Date('2026-12-24'),
        })
        .returning();
      limitedCatalog = drop ?? null;
    }

    const productSeeds = buildProductsFor(i);

    for (let p = 0; p < productSeeds.length; p++) {
      const ps = productSeeds[p]!;
      // Place the last product in the limited catalog if one exists
      const targetCatalog =
        limitedCatalog && p === productSeeds.length - 1
          ? limitedCatalog
          : defaultCatalog;

      const [product] = await db
        .insert(products)
        .values({
          catalogId: targetCatalog.id,
          artisanProfileId: profile.id,
          slug: slugify(ps.title),
          title: ps.title,
          description: ps.description || null,
          price: ps.price,
          currency: 'PHP',
          stockOnHand: ps.stockOnHand,
          status: ps.status,
          materials: ps.materials,
        })
        .returning();
      if (!product) throw new Error('Failed to create product');

      for (let img = 0; img < ps.imageCount; img++) {
        await db.insert(productImages).values({
          productId: product.id,
          url: placeholderImage(`${ps.title} ${img + 1}`),
          altText: `${ps.title} — view ${img + 1}`,
          position: img,
          width: 800,
          height: 1000,
        });
      }
    }
  }

  logger.info('Seed complete.');
  logger.info('--- Test credentials ---');
  logger.info(`Seller: maria@balikha.test / ${TEST_PASSWORD}`);
  logger.info(`Seller: tboli@balikha.test / ${TEST_PASSWORD}`);
  logger.info(`Seller: narra@balikha.test / ${TEST_PASSWORD}`);
  logger.info(`Buyer:  buyer@balikha.test / ${TEST_PASSWORD}`);
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error({ err: e }, 'Seed failed');
    process.exit(1);
  });
