import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BUCKET, s3 } from './client';

// 5 minutes — long enough for a slow phone upload, short enough that a
// leaked presigned URL is unusable hours later. The S3 layer enforces both
// the ContentType and ContentLength against what we signed for, so a
// client trying to upload a different file size or MIME will get rejected
// at the storage edge (not at our origin).
const PRESIGN_EXPIRES_SECONDS = 60 * 5;

export async function presignProductImageUpload(opts: {
  key: string;
  contentType: string;
  sizeBytes: number;
}): Promise<{ url: string }> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: opts.key,
    ContentType: opts.contentType,
    ContentLength: opts.sizeBytes,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRES_SECONDS });
  return { url };
}
