import { and, eq, inArray } from "drizzle-orm";
import { notifications, users } from "../drizzle/schema";
import { getDb } from "./db";
import { normalizeWhatsAppNumber } from "./whatsappNumber";

export { normalizeWhatsAppNumber };

export type NotificationType =
  | "booking_new"
  | "booking_accepted"
  | "booking_rejected"
  | "listing_approved"
  | "listing_rejected"
  | "lease_expiring"
  | "voucher_issued"
  | "system";

type EmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type NotificationInput = {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  href?: string;
  entityType?: string;
  entityId?: number;
  dedupeKey?: string;
  email?: EmailInput;
};

export type EmailDeliveryResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export async function sendTransactionalEmail(input: EmailInput): Promise<EmailDeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return { status: "skipped", reason: "email_provider_not_configured" };
  }
  if (!isValidEmail(input.to) || !isValidEmail(from)) {
    return { status: "failed", reason: "invalid_email_configuration" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[Email] Provider rejected message (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
      return { status: "failed", reason: `provider_${response.status}` };
    }

    return { status: "sent" };
  } catch (error) {
    console.warn("[Email] Provider request failed:", error instanceof Error ? error.message : String(error));
    return { status: "failed", reason: "provider_network_error" };
  }
}

export async function notifyUser(input: NotificationInput): Promise<number | null> {
  const db = await getDb();
  if (!db) {
    console.warn("[Notification] Database unavailable; notification was not persisted");
    return null;
  }

  if (input.dedupeKey) {
    const [existing] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, input.userId), eq(notifications.dedupeKey, input.dedupeKey)))
      .limit(1);
    if (existing) return existing.id;
  }

  const [inserted] = await db.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    href: input.href,
    entityType: input.entityType,
    entityId: input.entityId,
    dedupeKey: input.dedupeKey,
    emailStatus: input.email ? "not_sent" : "skipped",
  }).returning({ insertId: notifications.id });

  const notificationId = Number(inserted.insertId);
  if (!input.email) return notificationId;

  const delivery = await sendTransactionalEmail(input.email);
  if (delivery.status === "sent") {
    await db.update(notifications)
      .set({ emailStatus: "sent", emailSentAt: new Date() })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, input.userId)));
  } else {
    await db.update(notifications)
      .set({ emailStatus: delivery.status })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, input.userId)));
  }

  return notificationId;
}

export async function safeNotifyUser(input: NotificationInput): Promise<number | null> {
  try {
    return await notifyUser(input);
  } catch (error) {
    console.error("[Notification] Failed to create notification:", error);
    return null;
  }
}

/**
 * Admin inbox that receives partner/listing alerts. Defaults to the platform's
 * operations address; override with ADMIN_ALERT_EMAIL.
 */
export function adminAlertEmail(): string {
  return process.env.ADMIN_ALERT_EMAIL?.trim() || "altussplace@gmail.com";
}

export type AdminAlertInput = {
  title: string;
  message: string;
  href?: string;
  type?: NotificationType;
  entityType?: string;
  entityId?: number;
  dedupeKey?: string;
};

/**
 * Lightweight admin alert: emits ONE transactional email (Resend) to the admin
 * inbox and persists an in-app notification for every operator account.
 * Never throws — alerts must never block the business flow (mirrors the
 * audit-logging contract).
 */
export async function alertAdmins(input: AdminAlertInput): Promise<void> {
  try {
    await sendTransactionalEmail({
      to: adminAlertEmail(),
      subject: input.title,
      ...buildEmailContent(input.title, input.message, input.href),
    });

    const db = await getDb();
    if (!db) return;
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.role, ["admin", "SUPER_ADMIN"]))
      .limit(50);
    for (const admin of admins) {
      await safeNotifyUser({
        userId: admin.id,
        type: input.type ?? "system",
        title: input.title,
        message: input.message,
        href: input.href,
        entityType: input.entityType,
        entityId: input.entityId,
        dedupeKey: input.dedupeKey ? `admin:${input.dedupeKey}` : undefined,
      });
    }
  } catch (error) {
    console.error("[AdminAlert] failed:", error instanceof Error ? error.message : String(error));
  }
}

export type WhatsAppDeliveryResult =
  | { status: "sent"; messageId?: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/**
 * Sends an instant WhatsApp Business Cloud API text message to a Moroccan
 * number. Skips cleanly when the provider is not configured so the booking
 * flow is never blocked.
 */
export async function sendWhatsAppText(to: string | null | undefined, body: string): Promise<WhatsAppDeliveryResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const normalized = to ? normalizeWhatsAppNumber(to) : null;
  if (!token || !phoneNumberId) {
    return { status: "skipped", reason: "whatsapp_provider_not_configured" };
  }
  if (!normalized) {
    return { status: "skipped", reason: "invalid_recipient_number" };
  }
  try {
    const version = process.env.WHATSAPP_API_VERSION || "v20.0";
    const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalized,
        type: "text",
        text: { body },
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[WhatsApp] Provider rejected message (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
      return { status: "failed", reason: `provider_${response.status}` };
    }
    const json = (await response.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null;
    return { status: "sent", messageId: json?.messages?.[0]?.id };
  } catch (error) {
    console.warn("[WhatsApp] Provider request failed:", error instanceof Error ? error.message : String(error));
    return { status: "failed", reason: "provider_network_error" };
  }
}

export function buildEmailContent(title: string, message: string, actionUrl?: string) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message).replaceAll("\n", "<br />");
  const safeActionUrl = actionUrl && /^https:\/\//.test(actionUrl) ? actionUrl : undefined;
  const action = safeActionUrl
    ? `<p><a href="${safeActionUrl}" style="background:#E57C23;color:#fff;padding:10px 16px;text-decoration:none;border-radius:8px;display:inline-block">فتح المنصة / Ouvrir la plateforme</a></p>`
    : "";

  return {
    html: `<div dir="auto" style="font-family:Arial,sans-serif;line-height:1.7;color:#0B3C5D"><h2>${safeTitle}</h2><p>${safeMessage}</p>${action}<hr /><small>ALTUSplace Morocco</small></div>`,
    text: `${title}\n\n${message}${safeActionUrl ? `\n\n${safeActionUrl}` : ""}\n\nALTUSplace Morocco`,
  };
}
