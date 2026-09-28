import { randomBytes, scryptSync, createHash } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { partnerApplications, users } from "../../drizzle/schema";
import {
  MAX_IMAGE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
  MAX_VEHICLES,
  PARTNER_APPLY_MESSAGES,
  baseBytesLength,
  partnerFirstFieldMessage,
  safeBase64,
  validatePartnerApplyBody,
  type PartnerApplyInput,
  type PartnerFieldErrors,
} from "../../shared/partnerApplication";
import { getDb, withTransaction } from "../db";
import { logger } from "./logger";
import { sanitizeUserContent } from "./security";
import { alertAdmins } from "../notificationService";
import { normalizeWhatsAppNumber } from "../whatsappNumber";
import { storagePut } from "../storage";
import { partnerOpenId } from "./partnerAuth";

const SCRYPT_KEYLEN = 64;

/** Deterministic int32 from the normalized email (mirrors partnerAuth). */
function emailLockKey(email: string): number {
  return createHash("sha256").update(email).digest().readInt32BE(0);
}

/**
 * Sends an Arabic, field-addressed rejection. `fieldErrors` maps each offending
 * field (`agencyName`, `vehicles.0.pricePerDay`, ...) to the message the form
 * shows next to that exact input.
 */
function fail(
  res: Response,
  status: number,
  message: string,
  reason: string,
  fieldErrors?: PartnerFieldErrors,
): void {
  res.status(status).json({ error: message, reason, ...(fieldErrors ? { fieldErrors } : {}) });
}

function sanitizeName(value: string): string {
  return sanitizeUserContent(value, 120);
}

async function uploadStagedImage(
  prefix: string,
  image: { fileName?: string; mimeType: string; contentBase64: string },
): Promise<string> {
  const sourceBase64 = safeBase64(image.contentBase64);
  // Defence in depth: the shared schema already rejects an over-cap image as a
  // 400 before the application row is inserted, so reaching this means the
  // schema was bypassed. Kept because the alternative is a 500 from a row that
  // has already been written.
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
 *
 * Mandatory fields (agency name, city, contact person, phone, email,
 * password, and the fleet/property count for the chosen type) are validated
 * against the shared schema in shared/partnerApplication.ts — the same one the
 * browser form uses. A rejected payload gets HTTP 400 with an Arabic message
 * plus a `fieldErrors` map keyed by field, and never reaches the INSERT.
 */
export function registerPartnerApplicationRoutes(app: Express) {
  app.post("/api/auth/partner/apply", async (req: Request, res: Response) => {
    const body = (req as unknown as { body?: unknown }).body;

    // Strict validation gate. Everything downstream (INSERT, image upload,
    // admin notification) runs only for a fully complete application, so an
    // incomplete form can never reach the database.
    const validation = validatePartnerApplyBody(body);
    if (!validation.ok) {
      const rejectedFields = Object.keys(validation.fieldErrors);
      logger.warn("[PartnerApplication] rejected incomplete application", {
        fields: rejectedFields,
        count: rejectedFields.length,
      });
      fail(
        res,
        400,
        partnerFirstFieldMessage(validation.fieldErrors),
        "invalid_input",
        validation.fieldErrors,
      );
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
    } = validation.data satisfies PartnerApplyInput;

    const normalizedPhone = normalizeWhatsAppNumber(phone);
    if (!normalizedPhone) {
      // Defence in depth: `isValidPartnerPhone` already gates the schema, but
      // storage never receives an unnormalizable number.
      fail(res, 400, "رقم الهاتف غير صالح - أدخل الرقم بالصيغة الدولية.", "invalid_input", {
        phone: "رقم الهاتف غير صالح — أدخله بالصيغة الدولية (مثال: +212612345678).",
      });
      return;
    }

    const galleryImages = gallery ?? [];
    const totalImageBytes =
      (logo ? baseBytesLength(safeBase64(logo.contentBase64)) : 0) +
      galleryImages.reduce((sum, image) => sum + baseBytesLength(safeBase64(image.contentBase64)), 0);
    if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
      // The field entry matters: without one the form can only show the banner
      // and has no control to focus.
      fail(res, 400, PARTNER_APPLY_MESSAGES.imagesTooLarge, "images_too_large", {
        gallery: PARTNER_APPLY_MESSAGES.imagesTooLarge,
      });
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
