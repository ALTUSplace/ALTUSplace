import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { eq, sql } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { users } from "../../drizzle/schema";
import { getDb, withTransaction } from "../db";
import { getSessionCookieOptions } from "./cookies";
import { logger } from "./logger";
import { sdk } from "./sdk";
import { sanitizeUserContent } from "./security";

/** Mirror of the client-side name bounds (Register.tsx / RenterDashboard). */
export const RENTER_NAME_MIN = 2;
export const RENTER_NAME_MAX = 80;
const PASSWORD_MIN = 8;
const SCRYPT_KEYLEN = 64;

const emailSchema = z.string().trim().toLowerCase().email().max(320);
const passwordSchema = z.string().min(PASSWORD_MIN).max(256);
const nameSchema = z.string().trim().min(RENTER_NAME_MIN).max(RENTER_NAME_MAX);
const legalConsentVersionSchema = z.string().trim().min(1).max(80);

/**
 * Deterministic int32 from the normalized email: serializes concurrent
 * registrations of the SAME email through the same Postgres advisory lock, so
 * two racing requests can never both claim one address. Collisions between
 * different addresses only cause harmless serialization.
 */
function emailLockKey(email: string): number {
  return createHash("sha256").update(email).digest().readInt32BE(0);
}

export function renterOpenId(email: string): string {
  return createHash("sha256").update(email).digest("hex");
}

function sanitizeName(value: string): string {
  return sanitizeUserContent(value, 120);
}

/** Mint the same standard session cookie the OAuth / direct login flows use. */
async function issueRenterSession(req: Request, res: Response, openId: string, name: string): Promise<void> {
  const sessionToken = await sdk.createSessionToken(openId, {
    name,
    expiresInMs: ONE_YEAR_MS,
  });
  res.cookie(COOKIE_NAME, sessionToken, {
    ...getSessionCookieOptions(req),
    maxAge: ONE_YEAR_MS,
  });
}

function fail(res: Response, status: number, message: string, reason: string): void {
  res.status(status).json({ error: message, reason });
}

/**
 * Only allow same-origin `next` targets. Absolute URLs, protocol-relative
 * URLs ("//host") and bare strings are rejected, so the redirectTo echoed by
 * login can never be an open redirect.
 */
function safeNext(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}

/**
 * Self-service renter authentication — the native username/password flow for
 * tenants, separate from the partner (agency) auth AND the platform-owner
 * direct login. On success both endpoints mint the standard `app_session_id`
 * cookie, so the SPA's existing tRPC session handling (`auth.me`) recognises
 * the new account instantly.
 *
 *  POST /api/auth/renter/register -> create a 'user' account + session
 *  POST /api/auth/renter/login    -> verify credentials + session
 *
 * Both endpoints inherit the authStrictLimiter (5/min/IP) and CSRF origin
 * guard from registerSecurity() because they live under /api/auth/.
 */
export function registerRenterAuthRoutes(app: Express) {
  app.post("/api/auth/renter/register", async (req: Request, res: Response) => {
    const body = (req as unknown as { body?: unknown }).body;
    const parsed = typeof body === "object" && body !== null
      ? z.object({
          name: nameSchema,
          email: emailSchema,
          password: passwordSchema,
          legalConsentVersion: legalConsentVersionSchema,
        }).safeParse(body)
      : { success: false as const, error: null };

    if (!parsed.success) {
      const firstField = parsed.error ? Object.values(parsed.error.flatten().fieldErrors).flat()[0] : undefined;
      fail(res, 400, firstField ?? "بيانات غير صالحة. تحقق من الحقول ثم أعد المحاولة.", "invalid_input");
      return;
    }

    const { name, email, password, legalConsentVersion } = parsed.data;
    const storedName = sanitizeName(name);
    const salt = randomBytes(16).toString("hex");
    const passwordHash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
    let registeredUserId: number | null = null;

    try {
      let persisted = false;
      await withTransaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${emailLockKey(email)})`);
        const existing = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        const alreadyOpenId = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.openId, renterOpenId(email)))
          .limit(1);
        if (existing[0] || alreadyOpenId[0]) return;
        const [inserted] = await tx.insert(users).values({
          openId: renterOpenId(email),
          name: storedName,
          email,
          loginMethod: "renter",
          passwordHash,
          passwordSalt: salt,
          role: "user",
          accountStatus: "active",
          legalConsentVersion,
          legalConsentAt: new Date(),
          lastSignedIn: new Date(),
        }).returning({ id: users.id });
        registeredUserId = Number(inserted?.id ?? 0) || null;
        persisted = true;
      });
      if (!persisted) {
        fail(res, 409, "هذا البريد الإلكتروني مسجل بالفعل. سجّل الدخول أو استخدم بريداً آخر.", "email_taken");
        return;
      }
    } catch (error) {
      logger.error("[RenterAuth] registration failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      fail(res, 500, "تعذر إتمام التسجيل. حاول مرة أخرى أو تواصل مع الدعم.", "server_error");
      return;
    }

    await issueRenterSession(req, res, renterOpenId(email), storedName);
    logger.info("[RenterAuth] new renter registered");
    res.json({ success: true, role: "user", redirectTo: "/" });
  });

  app.post("/api/auth/renter/login", async (req: Request, res: Response) => {
    const body = (req as unknown as { body?: unknown }).body;
    const parsed = typeof body === "object" && body !== null
      ? z.object({
          email: emailSchema,
          password: passwordSchema,
          next: z.string().optional(),
        }).safeParse(body)
      : { success: false as const, error: null };

    if (!parsed.success) {
      fail(res, 400, "بريد إلكتروني أو كلمة مرور غير صالحة.", "invalid_input");
      return;
    }

    const { email, password, next } = parsed.data;
    const redirectTo = safeNext(next) ?? "/";

    try {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const rows = await db
        .select({
          openId: users.openId,
          name: users.name,
          role: users.role,
          accountStatus: users.accountStatus,
          passwordHash: users.passwordHash,
          passwordSalt: users.passwordSalt,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      const row = rows[0];
      if (!row || !row.passwordHash || !row.passwordSalt) {
        logger.warn("[RenterAuth] login attempt for unknown user", { email });
        fail(res, 401, "بيانات الدخول غير صحيحة.", "invalid_credentials");
        return;
      }
      const computed = scryptSync(password, row.passwordSalt, SCRYPT_KEYLEN);
      const stored = Buffer.from(row.passwordHash, "hex");
      const valid = computed.length === stored.length && timingSafeEqual(computed, stored);
      if (!valid) {
        logger.warn("[RenterAuth] login password mismatch", { email });
        fail(res, 401, "بيانات الدخول غير صحيحة.", "invalid_credentials");
        return;
      }
      if (row.accountStatus && row.accountStatus !== "active") {
        fail(res, 403, "هذا الحساب غير نشط.", "account_suspended");
        return;
      }
      if (row.role !== "user") {
        fail(res, 403, "هذا البريد مسجل كحساب غير مستأجر. استخدم بوابة الدخول المناسبة.", "not_renter");
        return;
      }
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.openId, row.openId));
      await issueRenterSession(req, res, row.openId, row.name ?? "");
      res.json({ success: true, role: "user", redirectTo });
    } catch (error) {
      logger.error("[RenterAuth] login failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      fail(res, 500, "تعذر تسجيل الدخول. حاول مرة أخرى.", "server_error");
    }
  });
}