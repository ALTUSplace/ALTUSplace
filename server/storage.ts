// Supabase Storage-backed file helpers.
//
// Uploads go to the private `altusplace` bucket using the service-role key
// (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Downloads return /storage/{key}
// paths served by the /storage proxy route (storageProxy.ts), which enforces
// per-key authorization and 307-redirects to a short-lived signed URL.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

export const STORAGE_BUCKET = "altusplace";

// Signed read URLs only need to outlive the proxy redirect; the proxy re-signs
// on every request, so a stale URL can never outlive its own use.
const SIGNED_URL_TTL_SECONDS = 3600;

let client: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  const projectUrl = ENV.supabaseUrl;
  const serviceRoleKey = ENV.supabaseServiceRoleKey;
  if (!projectUrl || !serviceRoleKey) {
    throw new Error(
      "Storage config missing: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  client ??= createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

// Idempotent per-process: ensure the bucket exists so the first upload in a
// fresh deployment never fails on a missing bucket.
let bucketReady: Promise<void> | null = null;
function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const storage = getSupabase().storage;
    const { error: getError } = await storage.getBucket(STORAGE_BUCKET);
    if (!getError) return;
    const { error: createError } = await storage.createBucket(STORAGE_BUCKET, {
      public: false,
    });
    if (createError) {
      throw new Error(
        `Supabase Storage bucket setup failed (${createError.statusCode ?? ""}): ${createError.message}`,
      );
    }
  })();
  return bucketReady;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  await ensureBucket();
  const { error } = await getSupabase().storage.from(STORAGE_BUCKET).upload(key, data, {
    contentType,
    upsert: false,
  });
  if (error) {
    throw new Error(
      `Supabase Storage upload failed (${error.statusCode ?? ""}): ${error.message}`,
    );
  }
  return { key, url: `/storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  await ensureBucket();
  const { data, error } = await getSupabase()
    .storage.from(STORAGE_BUCKET)
    .createSignedUrl(key, SIGNED_URL_TTL_SECONDS);
  if (error) {
    throw new Error(
      `Supabase Storage signed URL failed (${error.statusCode ?? ""}): ${error.message}`,
    );
  }
  if (!data?.signedUrl) throw new Error("Supabase returned an empty signed URL");
  return data.signedUrl;
}
