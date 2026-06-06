import { PutObjectCommand } from '@aws-sdk/client-s3';
import { BUCKET, s3 } from './client';

// Server-side upload of an already-sanitized buffer to storage. Used by the
// product-image Route Handler (and reusable for any server-proxied upload).
// Unlike the old presign flow, the server holds the bytes and writes them
// directly — no client ever PUTs to storage.
export async function putObject(opts: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
    }),
  );
}
