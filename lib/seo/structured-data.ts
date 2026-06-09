// Pure JSON-LD builders (ticket #61). Inputs are already-absolute URLs;
// these never prepend the app origin to an image URL.
type JsonLdObject = Record<string, unknown>;

export function productJsonLd(input: {
  name: string;
  description: string | null;
  images: string[]; // absolute URLs
  sku: string;
  brandName: string;
  url: string; // absolute
  currency: string;
  price: string | number;
  availability: 'InStock' | 'SoldOut' | 'OutOfStock';
}): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    description: input.description ?? undefined,
    image: input.images,
    sku: input.sku,
    brand: { '@type': 'Brand', name: input.brandName },
    offers: {
      '@type': 'Offer',
      url: input.url,
      priceCurrency: input.currency,
      price: input.price,
      itemCondition: 'https://schema.org/NewCondition',
      availability: `https://schema.org/${input.availability}`,
      seller: { '@type': 'Organization', name: input.brandName },
    },
  };
}

export function organizationJsonLd(input: {
  name: string;
  url: string; // absolute
  description: string | null;
  image: string | null; // absolute banner/representative image, or null
}): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: input.name,
    url: input.url,
    description: input.description ?? undefined,
    // `image` (representative), not `logo` — the shop banner is a wide
    // image, not a logo-shaped asset, so `logo` would misrepresent it.
    image: input.image ?? undefined,
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}
