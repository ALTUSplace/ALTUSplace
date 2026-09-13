// ── Gateway transaction ledger (server-side) ─────────────────────────────────
// Writes the transactions table for the Moroccan gateways and reconciles the
// verified webhook callbacks into the settlement pipeline:
//
//   transaction (pending) ─> paid ─> payments Succeeded + invoice Issued
//                              ─> booking Confirmed + listing Rented
//                              ─> escrow entry + access voucher issued
//
// Every webhook-driven update is idempotent: a second callback for a paid
// transaction is acknowledged without double-settling escrow/voucher.

import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../db";
import {
  bookings,
  bookingVouchers,
  escrowEntries,
  invoices,
  listings,
  payments,
  platformSettings,
  transactions,
  users,
  type InsertTransaction,
} from "../../drizzle/schema";
import { calculateInvoiceTotals, createInvoiceNumber } from "../billing";
import { createEscrowEntry, type EscrowDb } from "../escrow";
import { buildVoucherOwnerMessage, buildVoucherRenterMessage, createVoucherCode } from "../../shared/voucher";
import { safeNotifyUser, buildEmailContent } from "../notificationService";
import { generateCashVoucherReference } from "./cashVoucher";
import type { TransactionGateway, TransactionStatus } from "./types";

type Db = EscrowDb;

export async function insertGatewayTransaction(db: Db, values: InsertTransaction) {
  const [inserted] = await db.insert(transactions).values(values).returning({ insertId: transactions.id });
  const rows = await db.select().from(transactions).where(eq(transactions.id, inserted.insertId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Generates a 14-digit cash voucher reference that is free of collisions in
 * the unique external_reference index.
 */
export async function reserveCashVoucherReference(db: Db, gateway: "cashplus" | "wafacash"): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCashVoucherReference(gateway);
    const existing = await db.select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.externalReference, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
  }
  throw new Error("تعذر توليد مرجع نقدي فريد. أعد المحاولة.");
}

export async function findTransactionByExternalReference(db: Db, externalReference: string) {
  const rows = await db.select().from(transactions).where(eq(transactions.externalReference, externalReference)).limit(1);
  return rows[0] ?? null;
}

export type SettlementInput = {
  gateway: TransactionGateway;
  externalReference: string;
  status: Extract<TransactionStatus, "paid" | "failed" | "expired">;
  providerReference?: string | null;
  rawPayload?: unknown;
};

export async function settleTransactionFromWebhook(db: Db, input: SettlementInput): Promise<{ ok: boolean; alreadySettled: boolean }> {
  const tx = await findTransactionByExternalReference(db, input.externalReference);
  if (!tx) throw new Error("Unknown transaction reference.");
  if (tx.gateway !== input.gateway) throw new Error("Gateway mismatch for transaction reference.");

  if (tx.status === "paid") return { ok: true, alreadySettled: true };

  const now = new Date();
  const previousPayload = typeof tx.rawPayload === "object" && tx.rawPayload !== null ? tx.rawPayload : {};
  await db.update(transactions).set({
    status: input.status,
    rawPayload: {
      ...previousPayload,
      ...(input.providerReference ? { providerReference: input.providerReference } : {}),
      ...(input.rawPayload ? { callbackPayload: input.rawPayload } : {}),
    },
    updatedAt: now,
  }).where(eq(transactions.id, tx.id));

  if (input.status !== "paid") {
    // Failed/expired leaves the payment Pending (neutral state) so a retry can
    // settle it later without a second charge attempt.
    return { ok: true, alreadySettled: false };
  }

  await settlePaymentSideEffects(db, tx.id, tx.bookingId);
  return { ok: true, alreadySettled: false };
}

async function settlePaymentSideEffects(db: Db, transactionId: string, bookingId: number) {
  const booking = (await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1))[0];
  if (!booking) throw new Error("Booking not found for settled transaction.");

  const payment = (await db.select().from(payments).where(eq(payments.bookingId, bookingId)).limit(1))[0];
  if (payment) {
    await db.update(payments).set({ status: "Succeeded" }).where(eq(payments.id, payment.id));
    await db.update(invoices).set({ status: "Issued" }).where(eq(invoices.paymentId, payment.id));
  } else {
    throw new Error("No payment found to settle for booking.");
  }

  if (booking.status === "Pending") {
    await db.update(bookings).set({ status: "Confirmed" }).where(eq(bookings.id, bookingId));
    await db.update(listings).set({ status: "Rented" }).where(eq(listings.id, booking.listingId));
  }

  const settings = await db.select({ vatRateBasisPoints: platformSettings.vatRateBasisPoints }).from(platformSettings).limit(1);
  const totals = calculateInvoiceTotals(booking.totalPrice, booking.commissionFee, settings[0]?.vatRateBasisPoints ?? 2_000);

  const escrowListing = await db.select({
    ownerId: listings.ownerId,
    category: listings.category,
    stripeAccountId: users.stripeAccountId,
  }).from(listings)
    .leftJoin(users, eq(listings.ownerId, users.id))
    .where(eq(listings.id, booking.listingId)).limit(1);

  if (escrowListing[0]) {
    await createEscrowEntry(db, {
      bookingId,
      paymentId: payment.id,
      guestId: booking.renterId,
      vendorId: escrowListing[0].ownerId,
      listingCategory: escrowListing[0].category ?? "real_estate",
      totalPaid: totals.total,
      releaseDate: new Date(booking.endDate),
    });
  }

  const existingVoucher = await db.select().from(bookingVouchers).where(eq(bookingVouchers.bookingId, bookingId)).limit(1);
  if (!existingVoucher[0]) {
    const code = createVoucherCode(bookingId);
    const [voucherInsert] = await db.insert(bookingVouchers).values({
      bookingId,
      renterId: booking.renterId,
      code,
      qrPayload: `ALTUSplace voucher ${code} (booking #${bookingId})`,
      status: "Issued",
    }).returning({ insertId: bookingVouchers.id });

    const base = (process.env.VITE_APP_URL ?? "").replace(/\/+$/, "");
      const voucherUrl = base ? `${base}/voucher/${code}` : `/voucher/${code}`;
    const details = await db.select({
      listingTitle: listings.title,
      ownerId: listings.ownerId,
      ownerName: users.name,
      ownerEmail: users.email,
    }).from(listings)
      .leftJoin(users, eq(listings.ownerId, users.id))
      .where(eq(listings.id, booking.listingId)).limit(1);
    const detail = details[0];
    if (detail) {
      const renterMessage = buildVoucherRenterMessage(bookingId, detail.listingTitle, code, voucherUrl);
      const ownerMessage = buildVoucherOwnerMessage(bookingId, detail.listingTitle, booking.startDate, booking.endDate);
      await safeNotifyUser({
        userId: booking.renterId,
        type: "voucher_issued",
        title: "تذكرة الوصول الذكي جاهزة / Voucher prêt",
        message: renterMessage,
        href: `/voucher/${code}`,
        entityType: "voucher",
        entityId: Number(voucherInsert.insertId),
      });
      if (detail.ownerId !== booking.renterId) {
        await safeNotifyUser({
          userId: detail.ownerId,
          type: "voucher_issued",
          title: "دفع جديد وتجهيز الخدمة / Paiement reçu",
          message: ownerMessage,
          href: "/host",
          entityType: "booking",
          entityId: bookingId,
          email: detail.ownerEmail ? { to: detail.ownerEmail, subject: "ALTUSplace — دفع حجز جديد", ...buildEmailContent("دفع جديد وتجهيز الخدمة / Paiement reçu", ownerMessage, `${base}/host`) } : undefined,
        });
      }
    }
  }
}

/** Marks transactions past their expiry deadline as expired. */
export async function expireStaleCashTransactions(db: Db): Promise<number> {
  const now = new Date();
  const stale = await db.select().from(transactions)
    .where(and(
      eq(transactions.status, "pending"),
      ne(transactions.gateway, "payzone"),
      ne(transactions.gateway, "paytabs"),
    )).limit(1000);
  let updated = 0;
  for (const tx of stale) {
    const expiresAt = tx.expiresAt ?? tx.createdAt;
    if (expiresAt && expiresAt < now) {
      await db.update(transactions).set({ status: "expired", updatedAt: now }).where(eq(transactions.id, tx.id));
      updated++;
    }
  }
  return updated;
}