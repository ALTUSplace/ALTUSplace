import { and, eq } from "drizzle-orm";
import { notifications } from "../drizzle/schema";
import { getDb } from "./db";

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
  });

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

export function buildEmailContent(title: string, message: string, actionUrl?: string) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message).replaceAll("\n", "<br />");
  const safeActionUrl = actionUrl && /^https:\/\//.test(actionUrl) ? actionUrl : undefined;
  const action = safeActionUrl
    ? `<p><a href="${safeActionUrl}" style="background:#E57C23;color:#fff;padding:10px 16px;text-decoration:none;border-radius:8px;display:inline-block">فتح المنصة / Ouvrir la plateforme</a></p>`
    : "";

  return {
    html: `<div dir="auto" style="font-family:Arial,sans-serif;line-height:1.7;color:#0B3C5D"><h2>${safeTitle}</h2><p>${safeMessage}</p>${action}<hr /><small>B2-Rent Morocco</small></div>`,
    text: `${title}\n\n${message}${safeActionUrl ? `\n\n${safeActionUrl}` : ""}\n\nB2-Rent Morocco`,
  };
}
