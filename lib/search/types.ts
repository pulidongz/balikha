// Discriminated union of search hits. The `type` field lets a single
// renderer switch on hit kind without prop-drilling a "kind" alongside
// each result list.

export interface ProductHit {
  type: 'product';
  id: string;
  slug: string;
  title: string;
  price: string;
  currency: string;
  imageUrl: string | null;
  artisanSlug: string;
  artisanName: string;
  rank: number;
}

export interface ArtisanHit {
  type: 'artisan';
  id: string;
  shopSlug: string;
  shopName: string;
  bio: string | null;
  location: string | null;
  bannerImageUrl: string | null;
  rank: number;
}

export interface CatalogHit {
  type: 'catalog';
  id: string;
  slug: string;
  title: string;
  artisanSlug: string;
  artisanName: string;
  rank: number;
}

export type SearchHit = ProductHit | ArtisanHit | CatalogHit;

export interface ProductFilters {
  /** Any-of match — `materials && $1::text[]` (Postgres array overlap). */
  materials?: string[];
  priceMin?: number;
  priceMax?: number;
  /** stockOnHand > 0 AND status = 'published'. */
  inStockOnly?: boolean;
}

export interface SearchRequest {
  q: string;
  filters?: ProductFilters;
  cursor?: string;
  limit?: number;
}

export interface SearchResults {
  query: string;
  artisans: ArtisanHit[];
  catalogs: CatalogHit[];
  products: {
    items: ProductHit[];
    nextCursor: string | null;
  };
  totalProductCount: number;
}
