import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import { execa } from "execa";

/**
 * Storage client for downloading zip/7z uploads submitted by the user.
 * Compatible with both AWS S3 and Cloudflare R2 (same API, only the
 * endpoint changes).
 */

const s3 = new S3Client({
  region: process.env.STORAGE_REGION ?? "auto",
  endpoint: process.env.STORAGE_ENDPOINT || undefined, // empty = default AWS S3
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? "",
  },
});

export async function downloadAndExtract(storageKey: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const archivePath = join(destDir, "..", "archive-download");

  const command = new GetObjectCommand({
    Bucket: process.env.STORAGE_BUCKET,
    Key: storageKey,
  });
  const response = await s3.send(command);

  if (!response.Body) {
    throw new Error(`Empty object or not found in storage: ${storageKey}`);
  }

  await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(archivePath));

  // 7-Zip handles .zip, .7z, and most common archive formats
  await execa("7z", ["x", archivePath, `-o${destDir}`, "-y"], { timeout: 2 * 60 * 1000 });
}
