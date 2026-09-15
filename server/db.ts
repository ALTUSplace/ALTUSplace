import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { InsertUser, users } from "../drizzle/schema";
import { normalizeWhatsAppNumber } from "./whatsappNumber";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
  if (!_db && databaseUrl) {
    try {
      const client = postgres(databaseUrl, { prepare: false });
      _db = drizzle(client, { logger: false });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Execute a callback inside a database transaction.
 * Automatically rolls back on any thrown error.
 * Returns the callback's return value.
 */
export async function withTransaction<T>(
  fn: (tx: any) => Promise<T>,
): Promise<T> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async (tx) => {
    return fn(tx);
  });
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    if (user.name !== undefined) {
      values.name = user.name;
      updateSet.name = user.name;
    }
    if (user.email !== undefined) {
      values.email = user.email;
      updateSet.email = user.email;
    }

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.legalConsentVersion !== undefined) {
      values.legalConsentVersion = user.legalConsentVersion;
      updateSet.legalConsentVersion = user.legalConsentVersion;
    }
    if (user.legalConsentAt !== undefined) {
      values.legalConsentAt = user.legalConsentAt;
      updateSet.legalConsentAt = user.legalConsentAt;
    }
    // Authoritative operator elevation: the platform owner (OWNER_OPEN_ID) and
    // any openIds listed in SUPER_ADMIN_OPEN_IDS are always synced to
    // SUPER_ADMIN on login. This is what lets /admin/super/* recognise the
    // operator session as super admin.
    const superAdminOpenIds = new Set<string>(
      [...ENV.superAdminOpenIds, ENV.ownerOpenId].filter(Boolean),
    );
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (superAdminOpenIds.has(user.openId)) {
      values.role = 'SUPER_ADMIN';
      updateSet.role = 'SUPER_ADMIN';
    }

    // Persist the profile phone when provided. For the owner/admin account,
    // fall back to OWNER_WHATSAPP_PHONE so the platform operator's number is
    // stored automatically on their first login.
    const providedPhone =
      user.whatsappPhone !== undefined
        ? (user.whatsappPhone ? normalizeWhatsAppNumber(user.whatsappPhone) : null)
        : undefined;
    const resolvedPhone =
      providedPhone !== undefined
        ? providedPhone
        : user.openId === ENV.ownerOpenId && ENV.ownerWhatsappPhone
          ? normalizeWhatsAppNumber(ENV.ownerWhatsappPhone)
          : undefined;
    if (resolvedPhone !== undefined) {
      values.whatsappPhone = resolvedPhone;
      updateSet.whatsappPhone = resolvedPhone;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: [users.openId],
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
export const db = new Proxy({} as any, {
  get(_, prop) {
    // يتم توجيه الطلبات تلقائياً لقاعدة البيانات
    return (async () => {
      const database = await getDb();
      return (database as any)[prop];
    })();
  }
});