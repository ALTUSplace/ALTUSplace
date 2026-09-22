import type { Express, Request } from "express";
import { sdk } from "./sdk";
import { storageGetSignedUrl } from "../storage";

// Marketplace media that is intentionally public (listing photos, agency
// logos, generated images). Everything else requires authorization.
const PUBLIC_KEY_PATTERNS = [
  /^users\/[^/]+\/listings\//,
  /^users\/[^/]+\/agency\//,
  /^generated\//,
];

// Sensitive per-user objects: only the owning user or an admin may read them.
const SELF_OR_ADMIN_KEY_PATTERNS = [
  /^users\/[^/]+\/(kyc|checkout)\//,
];

// Objects whose high-entropy key doubles as a capability token, but which
// still require an authenticated caller (dispute attachments, contracts).
const AUTHENTICATED_KEY_PATTERNS = [
  /^disputes\//,
  /^contracts\//,
];

function matchesAny(key: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(key));
}

function isUnsafeKey(key: string): boolean {
  return key.startsWith("/") || key.includes("..") || key.includes("\\") || key.includes("\0");
}

function isAdmin(user: { role?: string | null }): boolean {
  const role = (user.role ?? "").toLowerCase();
  return role === "admin" || role === "super_admin";
}

/**
 * Resolve whether the caller may read a storage key. Returns false (and the
 * route responds 404, not 403, to avoid leaking object existence) when access
 * is not permitted.
 */
async function isAuthorizedForKey(req: Request, key: string): Promise<boolean> {
  if (matchesAny(key, PUBLIC_KEY_PATTERNS)) return true;

  let user: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
  try {
    user = await sdk.authenticateRequest(req);
  } catch {
    return false;
  }

  if (isAdmin(user)) return true;
  if (matchesAny(key, AUTHENTICATED_KEY_PATTERNS)) return true;

  const ownerMatch = /^users\/([^/]+)\//.exec(key);
  const ownerId = ownerMatch?.[1];
  if (matchesAny(key, SELF_OR_ADMIN_KEY_PATTERNS) && ownerId != null && String(user.id) === ownerId) {
    return true;
  }

  return false;
}

export function registerStorageProxy(app: Express) {
  app.get("/storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (isUnsafeKey(key)) {
      res.status(400).send("Invalid storage key");
      return;
    }

    if (!(await isAuthorizedForKey(req, key))) {
      res.status(404).send("Not found");
      return;
    }

    try {
      const url = await storageGetSignedUrl(key);
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
