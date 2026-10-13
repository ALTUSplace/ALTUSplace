import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The admin alert is the side effect that must fire exactly once per lead, so it
 * is recorded rather than executed — running the real service would also send an
 * outbound email from the test process.
 */
vi.mock("./notificationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./notificationService")>();
  return {
    ...actual,
    alertAdmins: vi.fn(async () => undefined),
    safeNotifyUser: vi.fn(async () => 1),
  };
});

import { alertAdmins } from "./notificationService";
import { appRouter } from "./routers";
import { resetIdempotencyStore } from "./_core/idempotency";
import type { TrpcContext } from "./_core/context";

/** A visitor is anonymous: `requestListing` is a public procedure. */
function visitorContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const lead = {
  name: "Samir Alaoui",
  phone: "+212612345678",
  carModel: "Dacia Duster 2022",
  city: "Casablanca",
};

function leadCapture() {
  return appRouter.createCaller(visitorContext()).requestListing;
}

beforeEach(() => {
  resetIdempotencyStore();
  vi.mocked(alertAdmins).mockClear();
});

describe("requestListing.create — idempotent lead intake", () => {
  it("collapses a rapid double-submit into exactly ONE admin alert", async () => {
    const { create } = leadCapture();

    const first = await create({ ...lead, requestId: "req-double" });
    const second = await create({ ...lead, requestId: "req-double" });

    expect(first).toMatchObject({ success: true, duplicate: false });
    expect(second).toMatchObject({ success: true, duplicate: true });
    expect(alertAdmins).toHaveBeenCalledTimes(1);
  });

  it("collapses a concurrent double-submit into ONE admin alert", async () => {
    const { create } = leadCapture();

    await Promise.all([
      create({ ...lead, requestId: "req-race" }),
      create({ ...lead, requestId: "req-race" }),
    ]);

    expect(alertAdmins).toHaveBeenCalledTimes(1);
  });

  it("treats a different requestId as a genuinely new lead", async () => {
    const { create } = leadCapture();

    await create({ ...lead, requestId: "req-1" });
    await create({ ...lead, requestId: "req-2" });

    expect(alertAdmins).toHaveBeenCalledTimes(2);
  });

  it("does not let a reused requestId suppress a DIFFERENT lead", async () => {
    const { create } = leadCapture();

    await create({ ...lead, requestId: "req-reused" });
    await create({ ...lead, phone: "+212699999999", requestId: "req-reused" });

    expect(alertAdmins).toHaveBeenCalledTimes(2);
  });

  it("still delivers leads from legacy clients that omit requestId", async () => {
    const { create } = leadCapture();

    await expect(create(lead)).resolves.toMatchObject({ success: true });
    await expect(create(lead)).resolves.toMatchObject({ success: true });

    // Without a key there is nothing to deduplicate on, so both are delivered.
    expect(alertAdmins).toHaveBeenCalledTimes(2);
  });
});
