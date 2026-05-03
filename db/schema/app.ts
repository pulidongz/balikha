import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth';

// Postgres tsvector — preprocessed full-text-searchable representation of
// one or more text columns. Drizzle has no built-in tsvector type, so we
// declare a minimal customType. The actual computation happens in SQL via
// generatedAlwaysAs() on the column itself; this is just the type tag so
// Drizzle emits `tsvector` as the column type in DDL and treats reads as
// strings.
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const catalogStatus = pgEnum('catalog_status', ['draft', 'published', 'archived']);
export const productStatus = pgEnum('product_status', [
  'draft',
  'published',
  'sold_out',
  'archived',
]);

export const artisanProfiles = pgTable(
  'artisan_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    shopSlug: text('shop_slug').notNull().unique(),
    shopName: text('shop_name').notNull(),
    bio: text('bio'),
    bannerImageUrl: text('banner_image_url'),
    location: text('location'),
    policies: text('policies'),
    // Weighted FTS document. A=shop_name (highest), B=location, C=bio.
    // Generated STORED — Postgres recomputes on UPDATE of any source column,
    // and backfills existing rows when the column is added.
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(shop_name, '')), 'A') || setweight(to_tsvector('english', coalesce(location, '')), 'B') || setweight(to_tsvector('english', coalesce(bio, '')), 'C')`,
    ),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('artisan_profiles_search_idx').using('gin', t.searchVector),
    // Trigram fallback for typo-tolerant matching on the high-signal
    // shop_name field. Joined with FTS via OR in the query layer.
    index('artisan_profiles_shop_name_trgm').using('gin', sql`${t.shopName} gin_trgm_ops`),
  ],
);

export const catalogs = pgTable(
  'catalogs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    artisanProfileId: uuid('artisan_profile_id')
      .notNull()
      .references(() => artisanProfiles.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    status: catalogStatus('status').notNull().default('draft'),
    releaseAt: timestamp('release_at'),
    closesAt: timestamp('closes_at'),
    // Weighted FTS document. A=title, B=description.
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B')`,
    ),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('catalogs_artisan_idx').on(t.artisanProfileId),
    uniqueIndex('catalogs_slug_per_artisan').on(t.artisanProfileId, t.slug),
    index('catalogs_search_idx').using('gin', t.searchVector),
  ],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    catalogId: uuid('catalog_id')
      .notNull()
      .references(() => catalogs.id, { onDelete: 'cascade' }),
    artisanProfileId: uuid('artisan_profile_id')
      .notNull()
      .references(() => artisanProfiles.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('PHP'),
    stockOnHand: integer('stock_on_hand').notNull().default(0),
    status: productStatus('status').notNull().default('draft'),
    dimensions: jsonb('dimensions').$type<{
      width?: number;
      height?: number;
      depth?: number;
      unit?: 'cm' | 'in';
    }>(),
    materials: text('materials').array(),
    weightGrams: integer('weight_grams'),
    // Weighted FTS document. A=title, B=materials (joined into a string),
    // C=description. Materials at B because a buyer searching "porcelain"
    // wants matches in the materials field, not just "...made of porcelain"
    // buried in prose.
    //
    // `immutable_array_to_string` is a SQL wrapper around `array_to_string`
    // — Postgres marks the built-in as STABLE (locale-dependent for some
    // element types) and rejects STABLE functions in generated column
    // expressions. For text[] the result is deterministic, so we wrap in
    // an IMMUTABLE function. Defined in drizzle/0004_sharp_nick_fury.sql.
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(immutable_array_to_string(materials, ' '), '')), 'B') || setweight(to_tsvector('english', coalesce(description, '')), 'C')`,
    ),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('products_catalog_idx').on(t.catalogId),
    index('products_artisan_idx').on(t.artisanProfileId),
    index('products_status_idx').on(t.status),
    uniqueIndex('products_slug_per_artisan').on(t.artisanProfileId, t.slug),
    index('products_search_idx').using('gin', t.searchVector),
    // Trigram fallback for typo-tolerant matching on title. Joined with
    // FTS via OR in the query layer.
    index('products_title_trgm').using('gin', sql`${t.title} gin_trgm_ops`),
  ],
);

export const productImages = pgTable(
  'product_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    // Source of truth for what's in our S3 bucket. Null means the image is
    // an external URL we don't own (e.g. seeded placeholder images, future
    // hot-linked imports) — storage cleanup logic must check before deleting.
    storageKey: text('storage_key'),
    // Denormalized public URL — derived from storageKey + S3_PUBLIC_URL_BASE
    // when our images, or an arbitrary external URL when not.
    url: text('url').notNull(),
    altText: text('alt_text'),
    position: integer('position').notNull().default(0),
    width: integer('width'),
    height: integer('height'),
  },
  (t) => [index('product_images_product_idx').on(t.productId)],
);

// Idempotency cache. Mutating server actions accept an optional client-
// generated UUID; on retry within 24h the cached response is returned
// instead of re-executing. The expires_at index supports the periodic
// cleanup sweep (deferred per plan §8 — add when the table grows).
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').primaryKey(),
    // null when the action was called by an unauthenticated session.
    userId: text('user_id'),
    // Discriminator so the same key reused across different actions
    // doesn't conflict (or pull a wrong cached response).
    scope: text('scope').notNull(),
    // The full Result<T> serialized — both success and failure are cached
    // so a retry sees the same outcome the first attempt did.
    responseJson: text('response_json').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (t) => [index('idempotency_keys_expires_idx').on(t.expiresAt)],
);
