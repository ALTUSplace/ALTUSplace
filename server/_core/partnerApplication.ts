import { randomBytes, scryptSync, createHash } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { partnerApplications, users } from "../../drizzle/schema";
import { getDb, withTransaction } from "../db";
import { logger } from "./logger";
import { sanitizeUserContent } from "./security";
import { alertAdmins } from "../notificationService";
import { normalizeWhatsAppNumber } from "../whatsappNumber";
import { storagePut } from "../storage";
import { partnerOpenId } from "./partnerAuth";

const SCRYPT_KEYLEN = 64;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB per image
const MAX_TOTAL_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB across logo + gallery
const MAX_GALLERY_IMAGES = 4;
const MAX_VEHICLES = 20;

const emailSchema = z.string().trim().toLowerCase().email().max(320);
const passwordSchema = z.string().min(8).max(256);
const nameSchema = z.string().trim().min(2).max(80);
const citySchema = z.string().trim().min(1).max(120);

const imageSchema = z.object({
  fileName: z.string().trim().min(1).max(120).optional(),
  mimeType: z.string().trim().min(1).max(64),
  contentBase64: z.string().min(1),
});

const vehicleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  year: z.number().int().min(1900).max(2100).optional(),
  seats: z.number().int().min(1).max(50).optional(),
  pricePerDay: z.number().int().min(1).max(100000),
  fuelType: z.string().trim().max(32).optional().or(z.literal("")),
  transmission: z.string().trim().max(32).optional().or(z.literal("")),
});

const applyBodySchema = z.object({
  type: z.enum(["car_rental", "real_estate"]),
  agencyName: nameSchema,
  city: citySchema,
  phone: z.string().trim().min(1).max(32),
  email: emailSchema,
  password: passwordSchema,
  website: z.string().trim().url().max(255).optional().or(z.literal("")),
  contactPerson: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  fleetSize: z.number().int().min(0).max(100000).optional(),
  propertyCount: z.number().int().min(0).max(100000).optional(),
  logo: imageSchema.optional(),
  gallery: z.array(imageSchema).max(MAX_GALLERY_IMAGES).optional(),
  vehicles: z.array(vehicleSchema).max(MAX_VEHICLES).optional(),
});

/** Deterministic int32 from the normalized email (mirrors partnerAuth). */
function emailLockKey(email: string): number {
  return createHash("sha256").update(email).digest().readInt32BE(0);
}

function fail(res: Response, status: number, message: string, reason: string): void {
  res.status(status).json({ error: message, reason });
}

function sanitizeName(value: string): string {
  return sanitizeUserContent(value, 120);
}

/** Strip an optional `data:<mime>;base64,` prefix so raw base64 always flows through. */
function safeBase64(value: string): string {
  const comma = value.indexOf(",");
  return comma !== -1 && value.slice(0, comma).includes(";base64") ? value.slice(comma + 1) : value;
}

/** Approximate decoded byte length of a base64 string (used for size caps). */
function baseBytesLength(base64: string): number {
  const len = base64.length;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

async function uploadStagedImage(
  prefix: string,
  image: { fileName?: string; mimeType: string; contentBase64: string },
): Promise<string> {
  const sourceBase64 = safeBase64(image.contentBase64);
  if (baseBytesLength(sourceBase64) > MAX_IMAGE_BYTES) {
    throw new Error("image_too_large");
  }
  const bytes = Buffer.from(sourceBase64, "base64");
  if (bytes.byteLength === 0) throw new Error("empty_image");
  const mime = image.mimeType.startsWith("image/") ? image.mimeType : "image/jpeg";
  const safeName =
    (image.fileName || "image").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "image";
  const stored = await storagePut(`${prefix}/${Date.now()}-${safeName}`, bytes, mime);
  return stored.url;
}

/**
 * Public partner application intake for the "كن شريك" (Partner With Us) flow.
 *
 *  POST /api/auth/partner/apply -> stores a PENDING partner application
 *
 * Inherits the authStrictLimiter (5/min/IP) and CSRF origin guard from
 * registerSecurity() because it lives under /api/auth/. The accepted images
 * arrive as base64 in the JSON body and are uploaded to object storage; the
 * scrypt credentials are kept on the application so an admin approval can
 * immediately mint the partner account (see routers.admin.reviewPartnerApplication).
 */
export function registerPartnerApplicationRoutes(app: Express) {
  app.post("/api/auth/partner/apply", async (req: Request, res: Response) => {
    const body = (req as unknown as { body?: unknown }).body;
    const parsed =
      typeof body === "object" && body !== null
        ? applyBodySchema.safeParse(body)
        : { success: false as const, error: null };

    if (!parsed.success) {
      const firstField = parsed.error
        ? Object.values(parsed.error.flatten().fieldErrors).flat()[0]
        : undefined;
      fail(res, 400, firstField ?? "بيانات غير صالحة. تحقق من الحقول ثم أعد المحاولة.", "invalid_input");
      return;
    }

    const {
      type,
      agencyName,
      city,
      phone,
      email,
      password,
      website,
      contactPerson,
      description,
      fleetSize,
      propertyCount,
      logo,
      gallery,
      vehicles,
    } = parsed.data;

    const normalizedPhone = normalizeWhatsAppNumber(phone);
    if (!normalizedPhone) {
      fail(res, 400, "رقم الهاتف غير صالح - أدخل الرقم بالصيغة الدولية.", "invalid_input");
      return;
    }

    const galleryImages = gallery ?? [];
    const totalImageBytes =
      (logo ? baseBytesLength(safeBase64(logo.contentBase64)) : 0) +
      galleryImages.reduce((sum, image) => sum + baseBytesLength(safeBase64(image.contentBase64)), 0);
    if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
      fail(res, 400, "إجمالي حجم الصور كبير جداً — الحد الأقصى 10 ميجابايت.", "images_too_large");
      return;
    }

    const storedName = sanitizeName(agencyName);
    const storedCity = sanitizeUserContent(city, 120);
    const storedDescription =
      description && description.trim() ? sanitizeUserContent(description, 2000) : null;
    const storedContact =
      contactPerson && contactPerson.trim() ? sanitizeUserContent(contactPerson, 120) : null;
    const storedWebsite =
      website && website.trim() ? website.trim().replace(/^https?:\/\//i, "") : null;
    const storedVehicles =
      type === "car_rental" && Array.isArray(vehicles) && vehicles.length > 0
        ? vehicles.slice(0, MAX_VEHICLES).map((vehicle) => ({
            name: sanitizeUserContent(vehicle.name, 120),
            year: vehicle.year ?? null,
            seats: vehicle.seats ?? null,
            pricePerDay: vehicle.pricePerDay,
            fuelType:
              vehicle.fuelType && vehicle.fuelType.trim()
                ? sanitizeUserContent(vehicle.fuelType.trim(), 32)
                : null,
            transmission:
              vehicle.transmission && vehicle.transmission.trim()
                ? sanitizeUserContent(vehicle.transmission.trim(), 32)
                : null,
          }))
        : null;
    const salt = randomBytes(16).toString("hex");
    const passwordHash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");

    let applicationId: number | null = null;

    try {
      await withTransaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${emailLockKey(email)})`);
        const existingUser = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (existingUser[0]) return;
        const openIdUser = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.openId, partnerOpenId(email)))
          .limit(1);
        if (openIdUser[0]) return;
        const openApplication = await tx
          .select({ id: partnerApplications.id })
          .from(partnerApplications)
          .where(and(eq(partnerApplications.email, email), ne(partnerApplications.status, "rejected")))
          .limit(1);
        if (openApplication[0]) return;
        const [inserted] = await tx
          .insert(partnerApplications)
          .values({
            type,
            agencyName: storedName,
            city: storedCity,
            phone: normalizedPhone,
            email,
            website: storedWebsite,
            contactPerson: storedContact,
            description: storedDescription,
            fleetSize: type === "car_rental" ? (fleetSize ?? null) : null,
            propertyCount: type === "real_estate" ? (propertyCount ?? null) : null,
            vehicles: storedVehicles,
            passwordHash,
            passwordSalt: salt,
          })
          .returning({ id: partnerApplications.id });
        applicationId = Number(inserted?.id ?? 0) || null;
      });

      if (!applicationId) {
        fail(
          res,
          409,
          "هذا البريد الإلكتروني مرتبط بالفعل بطلب قيد المراجعة أو بحساب شريك. استخدم بريداً آخر.",
          "email_taken",
        );
        return;
      }

      // Upload images to object storage. Attachments are mandatory: if any
      // upload fails the pending application is rolled back and the request
      // fails (no silent fallback), so a half-submitted application is never
      // left behind.
      let logoUrl: string | null = null;
      const galleryUrls: string[] = [];
      try {
        if (logo) logoUrl = await uploadStagedImage(`applications/${applicationId}/logo`, logo);
        for (const image of galleryImages) {
          galleryUrls.push(await uploadStagedImage(`applications/${applicationId}/gallery`, image));
        }
      } catch (imageError) {
        logger.error("[PartnerApplication] image upload failed — rolling back application", {
          applicationId,
          error: imageError instanceof Error ? imageError.message : String(imageError),
        });
        const db = await getDb();
        if (db) {
          await db.delete(partnerApplications).where(eq(partnerApplications.id, applicationId));
        }
        fail(res, 500, "تعذر رفع الصور إلى خادم التخزين. تحقق من الصور وأعد المحاولة.", "image_upload_failed");
        return;
      }
      const db = await getDb();
      if (db) {
        await db
          .update(partnerApplications)
          .set({ logoUrl, galleryUrls: galleryUrls.length ? galleryUrls : null })
          .where(eq(partnerApplications.id, applicationId));
      }

      await alertAdmins({
        type: "system",
        title: "طلب شريك جديد بانتظار المراجعة / Nouvelle demande de partenaire",
        message: `طلب «${type === "car_rental" ? "كراء السيارات" : "وكالة عقارية"}» من «${storedName}» — ${storedCity} — ${email} — ${normalizedPhone}.`,
        href: "/admin",
        entityType: "partner_application",
        entityId: applicationId,
        dedupeKey: `partner-application:${applicationId}`,
      });
      logger.warn("[PartnerApplication] new application submitted");
      res.json({ success: true, applicationId, status: "pending" });
    } catch (error) {
      logger.error("[PartnerApplication] apply failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      fail(res, 500, "تعذر إرسال الطلب. حاول مرة أخرى أو تواصل مع الدعم.", "server_error");
    }
  });
}