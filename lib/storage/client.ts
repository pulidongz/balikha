import { S3Client } from '@aws-sdk/client-s3';
import { env } from '@/env';

// Single shared S3 client. Same instance for MinIO (dev) and R2 (prod) —
// only the env values differ.
//
// forcePathStyle is required for MinIO (path-style: host/bucket/key) and
// harmless for R2 (which also accepts path-style). Without it, the SDK
// generates virtual-hosted-style URLs (bucket.host/key), which don't work
// against MinIO unless you configure a wildcard subdomain.
export const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

export const BUCKET = env.S3_BUCKET;
export const PUBLIC_URL_BASE = env.S3_PUBLIC_URL_BASE;
