import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("support and dispute audit contracts", () => {
  const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  const supportPage = readFileSync(resolve(process.cwd(), "client/src/pages/SupportTickets.tsx"), "utf8");
  const disputePage = readFileSync(resolve(process.cwd(), "client/src/pages/DisputeResolution.tsx"), "utf8");
  const schemaSource = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");
  const successPage = readFileSync(resolve(process.cwd(), "client/src/pages/Success.tsx"), "utf8");
  const carPage = readFileSync(resolve(process.cwd(), "client/src/pages/CarDetails.tsx"), "utf8");
  const reviewsSection = readFileSync(resolve(process.cwd(), "client/src/components/ReviewsSection.tsx"), "utf8");
  const mediaUpload = readFileSync(resolve(process.cwd(), "client/src/components/AdvancedMediaUpload.tsx"), "utf8");

  it("exposes protected support list/create procedures with per-user filtering", () => {
    expect(routerSource).toMatch(/supportTickets:\s*router\(/);
    expect(routerSource).toMatch(/list:\s*protectedProcedure[\s\S]*?supportTickets\.userId,\s*ctx\.user!\.id/);
    expect(routerSource).toMatch(/create:\s*protectedProcedure[\s\S]*?userId:\s*ctx\.user!\.id/);
    expect(schemaSource).toMatch(/export const supportTickets = pgTable\("support_tickets"/);
  });

  it("validates dispute ownership and persists uploaded evidence metadata", () => {
    expect(routerSource).toMatch(/listMine:\s*protectedProcedure/);
    expect(routerSource).toMatch(/booking\[0\]\.renterId === ctx\.user!\.id/);
    expect(routerSource).toMatch(/listing\[0\]\?\.ownerId === ctx\.user!\.id/);
    expect(routerSource).toMatch(/storagePut\(`disputes/);
    expect(schemaSource).toMatch(/export const disputeAttachments = pgTable\("dispute_attachments"/);
  });

  it("keeps booking approval notifications aligned with Pending to Confirmed flow", () => {
    const createBlock = routerSource.match(/bookings:\s*router\(\{[\s\S]*?ownerTitle[\s\S]*?safeNotifyUser\([\s\S]*?type:\s*"booking_new"[\s\S]*?\}\);/)?.[0] ?? "";
    expect(createBlock).toMatch(/type:\s*"booking_new"/);
    expect(createBlock).not.toMatch(/type:\s*"booking_accepted"/);
    expect(routerSource).toMatch(/ownerUpdateStatus:\s*ownerProcedure[\s\S]*?booking_accepted/);
    expect(routerSource).toMatch(/ownerUpdateStatus:\s*ownerProcedure[\s\S]*?booking_rejected/);
    expect(routerSource).toMatch(/ownerUpdateStatus:\s*ownerProcedure[\s\S]*?booking\.status !== "Pending"/);
    expect(routerSource).toMatch(/ownerUpdateStatus:\s*ownerProcedure[\s\S]*?eq\(bookings\.status, "Confirmed"\)/);
    expect(routerSource).toMatch(/ownerUpdateStatus:\s*ownerProcedure[\s\S]*?ne\(bookings\.id, booking\.bookingId\)/);
    expect(routerSource).toMatch(/where\(and\(eq\(bookings\.id, input\.bookingId\), eq\(bookings\.status, "Pending"\)\)\)/);
  });

  it("requires a confirmed booking before contract generation and keeps review content server-backed", () => {
    expect(routerSource).toMatch(/commercialLeaseContracts:[\s\S]*?booking\[0\]\.status !== "Confirmed"/);
    expect(successPage).toMatch(/trpc\.bookings\.getById\.useQuery/);
    expect(successPage).toMatch(/const isPending = !booking \|\| bookingStatus !== ['"]Confirmed['"]/);
    expect(successPage).not.toMatch(/const bookingStatus = searchParams\.get\(['"]bookingStatus/);
    expect(successPage).toMatch(/if \(isPending\) \{/);
    expect(carPage).not.toMatch(/reviews:\s*\[/);
    expect(carPage).not.toMatch(/ratingValue:\s*[0-9]/);
    expect(reviewsSection).toMatch(/trpc\.reviews\.listByListing\.useQuery/);
    expect(reviewsSection).not.toMatch(/useState<Review\[\]>\(\[/);
  });

  it("uses protected storage upload for listing media instead of persisting local preview URLs", () => {
    expect(routerSource).toMatch(/storage:\s*router\([\s\S]*?uploadImage:\s*ownerProcedure/);
    expect(routerSource).toMatch(/uploadImage:[\s\S]*?contentBase64:\s*z\.string\(\)\.min\(1\)\.max\(/);
    expect(routerSource).toMatch(/uploadImage:[\s\S]*?storagePut\(`users\/\$\{ctx\.user!\.id\}\/listings/);
    expect(mediaUpload).toMatch(/trpc\.storage\.uploadImage\.useMutation/);
    expect(mediaUpload).toMatch(/await uploadImage\.mutateAsync/);
    expect(mediaUpload).not.toMatch(/mockUploadedUrls/);
  });

  it("uses server-backed queries and explicit loading/error/empty states in both pages", () => {
    expect(supportPage).toMatch(/trpc\.supportTickets\.list\.useQuery\(\)/);
    expect(supportPage).toMatch(/ticketsQuery\.isLoading/);
    expect(supportPage).toMatch(/ticketsQuery\.isError/);
    expect(supportPage).toMatch(/tickets\.length === 0/);
    expect(supportPage).not.toMatch(/useState<Ticket\[\]>\(\[/);

    expect(disputePage).toMatch(/trpc\.disputes\.listMine\.useQuery\(\)/);
    expect(disputePage).toMatch(/disputesQuery\.isLoading/);
    expect(disputePage).toMatch(/disputesQuery\.isError/);
    expect(disputePage).toMatch(/disputes\.length === 0/);
    expect(disputePage).not.toMatch(/useState\(\[\s*\{/);
  });
});
