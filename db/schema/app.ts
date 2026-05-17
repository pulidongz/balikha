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
  boolean,
  primaryKey,
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
    // Seller-controlled: marks a genuine limited edition. Drives the
    // storefront "Limited" badge; never auto-inferred from the dates above.
    isLimitedEdition: boolean('is_limited_edition').notNull().default(false),
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
    // GIN array index for the `materials && $1::text[]` filter. Without
    // this, materials filtering does a sequential scan over all products.
    index('products_materials_idx').using('gin', t.materials),
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

// Search query log. Aggregations on this table power the admin search
// analytics view (Phase 7). Deliberately no `user_id` — search behavior
// is product signal, and tying queries to specific users creates a
// privacy footprint with no operational benefit. `was_logged_in` is the
// only signed-in vs anonymous distinction we keep, as a single boolean.
//
// `request_id` correlates to the per-request ID propagated through
// proxy.ts → logger-context.ts, so a search event can be cross-referenced
// with its full request log when debugging.
export const searchEvents = pgTable(
  'search_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Raw user input — kept for cases where the normalized form has lost
    // signal (e.g. punctuation patterns indicating bot traffic).
    query: text('query').notNull(),
    // lowercased + whitespace-collapsed; the GROUP BY key for analytics.
    normalizedQuery: text('normalized_query').notNull(),
    resultCount: integer('result_count').notNull(),
    productResultCount: integer('product_result_count').notNull(),
    artisanResultCount: integer('artisan_result_count').notNull(),
    catalogResultCount: integer('catalog_result_count').notNull(),
    hadFilters: boolean('had_filters').notNull().default(false),
    wasLoggedIn: boolean('was_logged_in').notNull().default(false),
    requestId: text('request_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('search_events_normalized_query_idx').on(t.normalizedQuery),
    index('search_events_created_at_idx').on(t.createdAt),
  ],
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

// Saved shipping/billing addresses for a user. One user has many addresses;
// at most one is marked default-shipping and at most one default-billing.
// The mutual-exclusion of defaults is enforced in the server action layer
// inside a transaction (no partial-unique constraint at the DB level so
// that an address with no default flag is the cheap common case).
export const userAddresses = pgTable(
  'user_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    label: text('label'),
    recipientName: text('recipient_name').notNull(),
    phone: text('phone'),
    line1: text('line1').notNull(),
    line2: text('line2'),
    barangay: text('barangay'),
    city: text('city').notNull(),
    province: text('province').notNull(),
    postalCode: text('postal_code'),
    countryCode: text('country_code').notNull().default('PH'),
    isDefaultShipping: boolean('is_default_shipping').notNull().default(false),
    isDefaultBilling: boolean('is_default_billing').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('user_addresses_user_idx').on(t.userId)],
);

// Buyer follows artisan. Composite primary key (userId, artisanProfileId)
// makes duplicate follows structurally impossible — no UNIQUE INDEX needed.
// Buyer privacy: this table is queried in two directions only — "who do I
// follow?" (userId) and "how many follow this artisan?" (aggregated count
// on artisanProfileId). Sellers must NEVER see follower identities.
export const artisanFollows = pgTable(
  'artisan_follows',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    artisanProfileId: uuid('artisan_profile_id')
      .notNull()
      .references(() => artisanProfiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.artisanProfileId] }),
    index('artisan_follows_artisan_idx').on(t.artisanProfileId),
    index('artisan_follows_user_idx').on(t.userId),
  ],
);

// Wishlist items. Schema is future-friendly for multi-list support
// (`listId` is reserved; null means "default wishlist"). The unique index
// on (userId, productId) prevents duplicate wishlist entries — relied on
// by the toggle action's onConflictDoNothing() insert.
export const wishlistItems = pgTable(
  'wishlist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    listId: uuid('list_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('wishlist_items_user_idx').on(t.userId),
    index('wishlist_items_product_idx').on(t.productId),
    uniqueIndex('wishlist_items_unique_per_user').on(t.userId, t.productId),
  ],
);

// Recently viewed. Capped at 50 per user (enforced in app code, not DDL).
// One row per (user, product); a repeat view updates `lastViewedAt` via
// onConflictDoUpdate. Composite PK matches that upsert target.
//
// Buyer privacy: this is buyer-private data. No seller-facing query may
// join this table to user identity (no "who viewed my product?" feature).
export const recentlyViewed = pgTable(
  'recently_viewed',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    lastViewedAt: timestamp('last_viewed_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.productId] }),
    index('recently_viewed_user_last_viewed_idx').on(t.userId, t.lastViewedAt),
  ],
);

// In-app notifications. Append-only with a `readAt` timestamp.
// `target` is polymorphic JSON so different notification types can point
// at different entities without a column-per-target-type explosion.
export const notificationType = pgEnum('notification_type', [
  'follow_new_listing',
  'wishlist_back_in_stock',
  'wishlist_low_stock',
  'order_status_changed',
  'system_announcement',
]);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: notificationType('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    target: jsonb('target').$type<{ kind: string; id: string; url?: string }>(),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
    // Partial index — the layout-level unread count query reads only
    // unread rows. Without WHERE, we'd index every notification ever sent.
    index('notifications_user_unread_idx')
      .on(t.userId)
      .where(sql`read_at IS NULL`),
  ],
);

// Orders — off-platform-payment lifecycle. The buyer foreign key uses ON
// DELETE RESTRICT (deleting a user with order history is a deliberate
// operation, not a cascade). Single-item orders for now: the product is
// snapshotted directly onto the order. Multi-item carts are deferred.
//
// Stock is reserved on placement and released on cancellation pre-shipment
// (see lib/actions/orders.ts). Disputes record signal — money never moves
// on this platform, so dispute resolution is reputation/admin-mediated.
export const orderStatus = pgEnum('order_status', [
  'pending_seller_response', // buyer placed, awaiting seller accept/decline
  'pending_payment_arrangement', // seller accepted, parties coordinating payment
  'payment_received', // seller marked payment as received
  'shipped', // seller marked as shipped
  'completed', // buyer marked as received (or auto-completed)
  'cancelled_by_buyer',
  'cancelled_by_seller',
  'auto_cancelled', // timeout
  'disputed', // either party flagged
]);

// cancellationReason is denormalized onto the order row so analytics
// queries ("how often does seller_no_response cause cancellations?") don't
// have to crack open order_events.metadataJson. Deliberate exception to
// the "events are source of truth" rule — events still carry the same
// value, but the order row is the indexed surface for aggregate queries.
export const cancellationReason = pgEnum('cancellation_reason', [
  'seller_no_response',
  'buyer_changed_mind',
  'seller_unable_to_fulfill',
  'item_unavailable',
  'payment_disagreement',
  'shipping_disagreement',
  'other',
]);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buyerUserId: text('buyer_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    artisanProfileId: uuid('artisan_profile_id')
      .notNull()
      .references(() => artisanProfiles.id, { onDelete: 'restrict' }),
    reference: text('reference').notNull().unique(),

    status: orderStatus('status').notNull().default('pending_seller_response'),

    // Single-item snapshot. The product FK SET NULLs on delete; the
    // snapshot text columns persist forever so order history remains
    // accurate even if a piece is later renamed or the listing is removed.
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    productTitleSnapshot: text('product_title_snapshot').notNull(),
    productSlugSnapshot: text('product_slug_snapshot').notNull(),
    productImageUrlSnapshot: text('product_image_url_snapshot'),
    artisanNameSnapshot: text('artisan_name_snapshot').notNull(),
    artisanSlugSnapshot: text('artisan_slug_snapshot').notNull(),

    // Money snapshot. No payment happens on platform; this records the
    // listed price at order time. numeric(10,2) is string-typed in
    // postgres-js — never Number() this for arithmetic, use formatPrice
    // and parseFloat at the boundary.
    priceSnapshot: numeric('price_snapshot', { precision: 10, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('PHP'),

    // Shipping address snapshot at order time.
    shippingAddressJson: jsonb('shipping_address_json').notNull(),
    notesFromBuyer: text('notes_from_buyer'),

    // Lifecycle timestamps. Slightly redundant with order_events but
    // materially faster for "when was this shipped?" queries.
    placedAt: timestamp('placed_at').notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at'),
    declinedAt: timestamp('declined_at'),
    paymentReceivedAt: timestamp('payment_received_at'),
    shippedAt: timestamp('shipped_at'),
    completedAt: timestamp('completed_at'),
    cancelledAt: timestamp('cancelled_at'),
    cancellationReason: cancellationReason('cancellation_reason'),
    cancellationNotes: text('cancellation_notes'),

    // Dispute fields reflect the MOST RECENT dispute on the order.
    // Disputes-over-time live in `order_disputes` (each filing is a
    // separate row). If a buyer files dispute A, admin resolves, buyer
    // files dispute B, these fields track B's timestamps; A's history
    // is preserved in `order_disputes`. Don't read these for "did this
    // order ever have a dispute?" — read order_disputes for that.
    disputedAt: timestamp('disputed_at'),
    disputeResolvedAt: timestamp('dispute_resolved_at'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('orders_buyer_idx').on(t.buyerUserId),
    index('orders_artisan_idx').on(t.artisanProfileId),
    index('orders_status_idx').on(t.status),
    index('orders_placed_at_idx').on(t.placedAt),
    // Composite for "show me pending orders for this seller" — the most
    // common seller-dashboard query.
    index('orders_artisan_status_idx').on(t.artisanProfileId, t.status),
  ],
);

// Append-only audit log for orders. Every status transition, dispute
// flag, and admin intervention writes a row here. Never updated, never
// deleted (except via order cascade). The structured `metadataJson` shape
// per event type is contractual — see plan §3 for the table.
//
// `actorUserId` is nullable because system events (auto-cancel,
// auto-complete) have no user actor. The `actorRole` text column carries
// the discriminator: 'buyer' | 'seller' | 'admin' | 'system'.
export const orderEventType = pgEnum('order_event_type', [
  'placed',
  'accepted',
  'declined',
  'payment_received',
  'shipped',
  'completed',
  'cancelled_by_buyer',
  'cancelled_by_seller',
  'auto_cancelled',
  'disputed',
  'dispute_resolved',
  'admin_intervention',
]);

export const orderEvents = pgTable(
  'order_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    type: orderEventType('type').notNull(),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    actorRole: text('actor_role').notNull(),
    notes: text('notes'),
    metadataJson: jsonb('metadata_json'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('order_events_order_idx').on(t.orderId),
    index('order_events_created_at_idx').on(t.createdAt),
  ],
);

// Disputes. One ACTIVE dispute per order is enforced by the partial
// unique index below; after admin resolution, a new dispute can be filed.
// Self-service withdrawal is intentionally not modeled — the enum has no
// 'withdrawn' state. Filers who change their mind contact admin, who can
// resolve as 'resolved_neutral'. Keeps disputes admin-mediated and
// preserves their value as a trust signal.
export const disputeStatus = pgEnum('dispute_status', [
  'open',
  'under_review', // admin acknowledged, working on it
  'resolved_for_buyer',
  'resolved_for_seller',
  'resolved_neutral', // no clear fault
]);

export const orderDisputes = pgTable(
  'order_disputes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    filedByUserId: text('filed_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    filedByRole: text('filed_by_role').notNull(), // 'buyer' | 'seller'
    status: disputeStatus('status').notNull().default('open'),
    reason: text('reason').notNull(), // filer's initial statement
    buyerStatement: text('buyer_statement'), // populated when other party responds
    sellerStatement: text('seller_statement'),
    adminResolution: text('admin_resolution'), // admin's written resolution
    resolvedByAdminUserId: text('resolved_by_admin_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    filedAt: timestamp('filed_at').notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at'),
  },
  (t) => [
    index('order_disputes_order_idx').on(t.orderId),
    index('order_disputes_status_idx').on(t.status),
    // Partial unique index: at most one ACTIVE dispute per order. After
    // admin resolution, a new dispute can be filed. Closes the
    // select-then-insert race in fileDispute.
    uniqueIndex('order_disputes_active_per_order')
      .on(t.orderId)
      .where(sql`status IN ('open', 'under_review')`),
  ],
);
