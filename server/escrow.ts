// ── Escrow & Commission Domain ──────────────────────────────────────────────
// Tier-aware platform commission resolution, escrow lifecycle and the
// Stripe Connect payout webhook. Because every split is recomputed from the
// database on each request, Commission Controller changes take effect
// instantly on the next booking/payment — no restart required.

import { and, eq } from "drizzle-orm";
import { commissionTiers, escrowEntries, platformSettings, users } from "../drizzle/schema";
import { createTransfer, isStripeConfigured, verifyWebhookEvent } from "./stripe";
import type { getDb } from "./db";

export type EscrowDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export const VENDOR_TIERS = ["bronze", "silver", "gold"] as const;
export type VendorTier = (typeof VENDOR_TIERS)[number];
export type CommissionMode = "percent" | "flat";

export type CommissionSettings = {
  mode: CommissionMode;
  percentBasisPoints: number;
  flatAmount: number;
};

export type EffectiveCommission = CommissionSettings & {
  fee: number;
  vendorTier: VendorTier;
  source: "global" | VendorTier;
};

const DEFAULT_GLOBAL_SETTINGS: CommissionSettings = {
  mode: "percent",
  percentBasisPoints: 1_000,
  flatAmount: 0,
};

export function isVendorTier(value: unknown): value is VendorTier {
  return typeof value === "string" && (VENDOR_TIERS as readonly string[]).includes(value);
}

export function normalizeCommissionSettings(input: {
  mode: CommissionMode;
  percentBasisPoints?: number;
  flatAmount?: number;
}): CommissionSettings {
  const mode = input.mode === "percent" || input.mode === "flat" ? input.mode : "percent";
  const percentBasisPoints = mode === "percent"
    ? Math.round(input.percentBasisPoints ?? DEFAULT_GLOBAL_SETTINGS.percentBasisPoints)
    : 0;
  const flatAmount = mode === "flat"
    ? Math.round(input.flatAmount ?? 0)
    : 0;

  if (!Number.isInteger(percentBasisPoints) || percentBasisPoints < 0 || percentBasisPoints > 10_000) {
    throw new Error("Commission percent must be between 0 and 10000 basis points.");
  }
  if (!Number.isInteger(flatAmount) || flatAmount < 0 || flatAmount > 1_000_000_000) {
    throw new Error("Flat commission must be a non-negative integer.");
  }
  return { mode, percentBasisPoints, flatAmount };
}

/** Computes the platform fee for a subtotal under a given commission policy. */
export function calculateCommission(subtotal: number, settings: CommissionSettings): number {
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new Error("Subtotal must be a non-negative finite number.");
  }
  if (settings.mode === "flat") return Math.min(settings.flatAmount, subtotal);
  return Math.round((subtotal * settings.percentBasisPoints) / 10_000);
}

export async function getGlobalCommission(db: EscrowDb): Promise<CommissionSettings> {
  const rows = await db.select({
    commissionMode: platformSettings.commissionMode,
    commissionRateBasisPoints: platformSettings.commissionRateBasisPoints,
    flatCommissionAmount: platformSettings.flatCommissionAmount,
  }).from(platformSettings).limit(1);
  const row = rows[0];
  if (!row) return DEFAULT_GLOBAL_SETTINGS;
  return {
    mode: row.commissionMode === "flat" ? "flat" : "percent",
    percentBasisPoints: Number(row.commissionRateBasisPoints ?? 1_000),
    flatAmount: Number(row.flatCommissionAmount ?? 0),
  };
}

export async function getTierCommission(db: EscrowDb, tier: VendorTier): Promise<CommissionSettings | null> {
  const rows = await db.select({
    mode: commissionTiers.mode,
    percentBasisPoints: commissionTiers.percentBasisPoints,
    flatAmount: commissionTiers.flatAmount,
  }).from(commissionTiers).where(eq(commissionTiers.tier, tier)).limit(1);
  if (!rows[0]) return null;
  return {
    mode: rows[0].mode === "flat" ? "flat" : "percent",
    percentBasisPoints: Number(rows[0].percentBasisPoints ?? 1_000),
    flatAmount: Number(rows[0].flatAmount ?? 0),
  };
}

/**
 * Resolves the effective commission policy for a vendor's booking:
 * tier override wins when present, otherwise the global platform default.
 * Reads live rows so changes apply immediately to new bookings.
 */
export async function resolveEffectiveCommission(
  db: EscrowDb,
  vendorId: number,
  subtotal: number,
): Promise<EffectiveCommission> {
  const global = await getGlobalCommission(db);
  const [vendor] = await db.select({ vendorTier: users.vendorTier }).from(users).where(eq(users.id, vendorId)).limit(1);
  const vendorTier: VendorTier = isVendorTier(vendor?.vendorTier) ? vendor.vendorTier : "bronze";
  const tierOverride = await getTierCommission(db, vendorTier);
  if (tierOverride) {
    return {
      ...tierOverride,
      vendorTier,
      source: vendorTier,
      fee: calculateCommission(subtotal, tierOverride),
    };
  }
  return {
    ...global,
    vendorTier,
    source: "global",
    fee: calculateCommission(subtotal, global),
  };
}

export async function upsertGlobalCommission(
  db: EscrowDb,
  input: { mode: CommissionMode; percentBasisPoints?: number; flatAmount?: number },
  actorId: number,
): Promise<CommissionSettings> {
  const normalized = normalizeCommissionSettings(input);
  const existing = await db.select({ id: platformSettings.id }).from(platformSettings).limit(1);
  if (existing[0]) {
    await db.update(platformSettings).set({
      commissionMode: normalized.mode,
      commissionRateBasisPoints: normalized.percentBasisPoints,
      flatCommissionAmount: normalized.flatAmount,
      updatedBy: actorId,
      updatedAt: new Date(),
    }).where(eq(platformSettings.id, existing[0].id));
  } else {
    await db.insert(platformSettings).values({
      commissionMode: normalized.mode,
      commissionRateBasisPoints: normalized.percentBasisPoints,
      flatCommissionAmount: normalized.flatAmount,
      updatedBy: actorId,
    });
  }
  return normalized;
}

export async function upsertTierCommission(
  db: EscrowDb,
  input: { tier: VendorTier; mode: CommissionMode; percentBasisPoints?: number; flatAmount?: number },
  actorId: number,
): Promise<CommissionSettings> {
  const normalized = normalizeCommissionSettings(input);
  const existing = await db.select({ id: commissionTiers.id }).from(commissionTiers).where(eq(commissionTiers.tier, input.tier)).limit(1);
  if (existing[0]) {
    await db.update(commissionTiers).set({
      mode: normalized.mode,
      percentBasisPoints: normalized.percentBasisPoints,
      flatAmount: normalized.flatAmount,
      updatedBy: actorId,
      updatedAt: new Date(),
    }).where(eq(commissionTiers.id, existing[0].id));
  } else {
    await db.insert(commissionTiers).values({
      tier: input.tier,
      mode: normalized.mode,
      percentBasisPoints: normalized.percentBasisPoints,
      flatAmount: normalized.flatAmount,
      updatedBy: actorId,
    });
  }
  return normalized;
}

// ── Escrow lifecycle ─────────────────────────────────────────────────────────

export type EscrowCreationInput = {
  bookingId: number;
  paymentId: number;
  guestId: number;
  vendorId: number;
  listingCategory: string;
  totalPaid: number;
  releaseDate: Date;
};

const OPEN_ESCROW_STATUSES = ["held", "releasable", "frozen", "mediated"] as const;
const MUTABLE_ESCROW_STATUSES = ["held", "releasable"] as const;

function isMutableEscrowStatus(value: string): boolean {
  return (MUTABLE_ESCROW_STATUSES as readonly string[]).includes(value);
}

/** Opens a ledger row once a payment settles; idempotent per payment. */
export async function createEscrowEntry(db: EscrowDb, input: EscrowCreationInput): Promise<boolean> {
  const existing = await db.select({ id: escrowEntries.id }).from(escrowEntries)
    .where(and(eq(escrowEntries.paymentId, input.paymentId), eq(escrowEntries.bookingId, input.bookingId)))
    .limit(1);
  if (existing[0]) return false;

  const commission = await resolveEffectiveCommission(db, input.vendorId, input.totalPaid);
  await db.insert(escrowEntries).values({
    bookingId: input.bookingId,
    paymentId: input.paymentId,
    guestId: input.guestId,
    vendorId: input.vendorId,
    listingCategory: input.listingCategory,
    totalPaid: input.totalPaid,
    platformCut: commission.fee,
    vendorPayoutShare: input.totalPaid - commission.fee,
    releaseDate: input.releaseDate,
    stripeTransferStatus: "pending",
    status: "held",
  });
  return true;
}

/** Attempts the Stripe Connect transfer for an entry without touching its status. */
async function attemptConnectTransfer(db: EscrowDb, entryId: number): Promise<{ ok: boolean; message: string }> {
  const [entry] = await db.select({
    id: escrowEntries.id,
    vendorPayoutShare: escrowEntries.vendorPayoutShare,
    bookingId: escrowEntries.bookingId,
    vendorId: escrowEntries.vendorId,
  }).from(escrowEntries).where(eq(escrowEntries.id, entryId)).limit(1);
  if (!entry) return { ok: false, message: "Escrow entry not found." };

  const [vendor] = await db.select({ stripeAccountId: users.stripeAccountId }).from(users).where(eq(users.id, entry.vendorId)).limit(1);
  if (!isStripeConfigured() || !vendor?.stripeAccountId) {
    return { ok: false, message: "Stripe Connect is not configured for this vendor." };
  }
  try {
    const transferId = await createTransfer(entry.vendorPayoutShare, "MAD", vendor.stripeAccountId, {
      escrowId: String(entry.id),
      bookingId: String(entry.bookingId),
      payout: "vendor",
    });
    await db.update(escrowEntries).set({
      stripeTransferStatus: "sent",
      stripeTransferId: transferId,
      updatedAt: new Date(),
    }).where(eq(escrowEntries.id, entry.id));
    return { ok: true, message: `Transfer initiated (${transferId}).` };
  } catch (error) {
    await db.update(escrowEntries).set({ stripeTransferStatus: "failed", updatedAt: new Date() }).where(eq(escrowEntries.id, entry.id));
    return { ok: false, message: `Stripe transfer failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Releases an escrow entry toward the vendor. Simulated (mark pending) when
 * Stripe Connect is not configured. Returns the outcome message.
 */
export async function releaseEscrowEntry(db: EscrowDb, escrowId: number): Promise<{ released: boolean; message: string }> {
  const [entry] = await db.select({ id: escrowEntries.id, status: escrowEntries.status }).from(escrowEntries).where(eq(escrowEntries.id, escrowId)).limit(1);
  if (!entry) return { released: false, message: "Escrow entry not found." };
  if (!isMutableEscrowStatus(entry.status)) {
    return { released: false, message: `Escrow is not releasable (current status: ${entry.status}).` };
  }

  const outcome = await attemptConnectTransfer(db, escrowId);
  await db.update(escrowEntries).set({
    stripeTransferStatus: outcome.ok ? "sent" : "pending",
    status: "releasable",
    updatedAt: new Date(),
  }).where(eq(escrowEntries.id, escrowId));
  return { released: true, message: outcome.ok ? outcome.message : "Stripe Connect not configured — marked release pending (simulated)." };
}

export async function freezeEscrowEntry(db: EscrowDb, escrowId: number): Promise<{ frozen: boolean; message: string }> {
  const [entry] = await db.select({ id: escrowEntries.id, status: escrowEntries.status }).from(escrowEntries).where(eq(escrowEntries.id, escrowId)).limit(1);
  if (!entry) return { frozen: false, message: "Escrow entry not found." };
  if (!isMutableEscrowStatus(entry.status)) {
    return { frozen: false, message: `Only held or releasable escrows can be frozen (current: ${entry.status}).` };
  }
  await db.update(escrowEntries).set({ status: "frozen", stripeTransferStatus: "held", updatedAt: new Date() }).where(eq(escrowEntries.id, escrowId));
  return { frozen: true, message: "Payout frozen." };
}

export async function mediateEscrowEntry(
  db: EscrowDb,
  escrowId: number,
  resolution: "release_to_vendor" | "refund_to_guest",
  mediationNote: string,
): Promise<{ mediated: boolean; message: string }> {
  const [entry] = await db.select({ id: escrowEntries.id, status: escrowEntries.status }).from(escrowEntries).where(eq(escrowEntries.id, escrowId)).limit(1);
  if (!entry) return { mediated: false, message: "Escrow entry not found." };
  if (!(OPEN_ESCROW_STATUSES as readonly string[]).includes(entry.status)) {
    return { mediated: false, message: `Escrow is already resolved (current: ${entry.status}).` };
  }

  await db.update(escrowEntries).set({
    status: "mediated",
    mediationNote: mediationNote.trim().slice(0, 2000),
    updatedAt: new Date(),
  }).where(eq(escrowEntries.id, escrowId));

  if (resolution === "release_to_vendor") {
    const outcome = await attemptConnectTransfer(db, escrowId);
    await db.update(escrowEntries).set({
      stripeTransferStatus: outcome.ok ? "sent" : "pending",
      status: "mediated",
      updatedAt: new Date(),
    }).where(eq(escrowEntries.id, escrowId));
    return { mediated: true, message: `Mediation resolved toward vendor — ${outcome.ok ? outcome.message : "payout pending (simulated)."}` };
  }

  await db.update(escrowEntries).set({
    stripeTransferStatus: "held",
    status: "mediated",
    updatedAt: new Date(),
  }).where(eq(escrowEntries.id, escrowId));
  return { mediated: true, message: "Mediation resolved toward guest — funds marked for refund." };
}

// ── Stripe Connect webhook ───────────────────────────────────────────────────

/**
 * Applies a verified Stripe Connect event to the escrow ledger. Returns
 * whether an escrow entry was found and updated.
 */
export async function handleStripeConnectEvent(db: EscrowDb, payload: unknown): Promise<{ handled: boolean; message: string }> {
  if (!payload || typeof payload !== "object") return { handled: false, message: "Invalid payload." };
  const event = payload as { type?: unknown; data?: unknown };
  const type = typeof event.type === "string" ? event.type : "";
  const object = event.data && typeof event.data === "object"
    ? (event.data as { object?: unknown }).object
    : undefined;
  if (!object || typeof object !== "object") return { handled: false, message: "No event object." };

  const metadata = (object as { metadata?: unknown }).metadata ?? {};
  const rowId = Number((metadata as Record<string, unknown>).escrowId ?? 0);
  const bookingId = Number((metadata as Record<string, unknown>).bookingId ?? 0);
  const transferId = typeof (object as { id?: unknown }).id === "string" ? (object as { id?: string }).id : null;

  const finder = rowId > 0
    ? eq(escrowEntries.id, rowId)
    : bookingId > 0
      ? eq(escrowEntries.bookingId, bookingId)
      : null;
  if (!finder) return { handled: true, message: `Unlinked ${type} event — ignored.` };

  const [entry] = await db.select({ id: escrowEntries.id }).from(escrowEntries).where(finder).limit(1);
  if (!entry) return { handled: false, message: `No escrow for ${type}.` };

  if (type === "transfer.created" || type === "transfer.updated") {
    const status = (object as { status?: unknown }).status;
    const patch: Record<string, unknown> = {
      stripeTransferId: transferId ?? null,
      updatedAt: new Date(),
    };
    if (status === "paid") {
      patch.stripeTransferStatus = "released";
      patch.status = "released";
    } else if (status === "failed") {
      patch.stripeTransferStatus = "failed";
    } else {
      patch.stripeTransferStatus = "sent";
    }
    await db.update(escrowEntries).set(patch as never).where(eq(escrowEntries.id, entry.id));
    return { handled: true, message: `Transfer ${transferId} -> ${status}.` };
  }

  if (type === "transfer.failed") {
    await db.update(escrowEntries).set({ stripeTransferStatus: "failed", updatedAt: new Date() }).where(eq(escrowEntries.id, entry.id));
    return { handled: true, message: "Transfer failed." };
  }

  if (type === "payment_intent.succeeded") {
    await db.update(escrowEntries).set({ stripeTransferStatus: "pending", updatedAt: new Date() }).where(eq(escrowEntries.id, entry.id));
    return { handled: true, message: "Payment settled — escrow awaiting release." };
  }

  return { handled: true, message: `${type} acknowledged.` };
}

export function createEscrowWebhookHandler(options: { getSecret: () => string }) {
  return async (req: import("express").Request, res: import("express").Response) => {
    const secret = options.getSecret();
    if (!secret || !isStripeConfigured()) {
      res.status(503).json({ error: "Escrow webhook is not configured." });
      return;
    }
    const rawBody = typeof req.body === "string"
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : "";
    const signature = req.headers["stripe-signature"] as string | undefined;
    let event: unknown;
    try {
      event = verifyWebhookEvent(rawBody, signature ?? "", secret);
    } catch {
      res.status(400).json({ error: "Invalid webhook signature." });
      return;
    }
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    const outcome = await handleStripeConnectEvent(db, event);
    res.json(outcome);
  };
}