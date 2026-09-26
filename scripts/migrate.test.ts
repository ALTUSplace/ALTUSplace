// Covers the parts of the migration runner that can be verified without a
// database: the connection-string classifier and the lock key. The transaction
// and advisory-lock behaviour itself is NOT covered here and cannot be, because
// no Postgres is reachable from the machine this was written on. That remains
// unverified and is called out in the PR rather than implied away.
import { describe, expect, it } from "vitest";
import { inspectConnectionString, MIGRATION_LOCK_KEY } from "./migrate.mjs";

const SESSION_POOLER = "postgres://u:p@aws-0-eu-north-1.pooler.supabase.com:5432/postgres";
const TRANSACTION_POOLER = "postgres://u:p@aws-0-eu-north-1.pooler.supabase.com:6543/postgres";
const DIRECT = "postgres://u:p@db.bndamyekddqkvrsnmfhe.supabase.co:5432/postgres";

describe("migration connection classification", () => {
  it("refuses port 6543, Supabase's transaction-mode pooler", () => {
    // This is the connection string the application actually uses today, and the
    // reason MIGRATION_DATABASE_URL exists. Under transaction mode the advisory
    // lock this runner relies on is not held for the life of the connection, so
    // two runs would each believe they had it.
    const verdict = inspectConnectionString(TRANSACTION_POOLER);

    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("6543");
    expect(verdict.reason).toContain("transaction-mode");
  });

  it("accepts the session pooler on 5432, which is the intended target", () => {
    const verdict = inspectConnectionString(SESSION_POOLER);

    expect(verdict.ok).toBe(true);
    expect(verdict.port).toBe("5432");
    expect(verdict.transactionPooler).toBe(false);
  });

  it("accepts a direct connection", () => {
    expect(inspectConnectionString(DIRECT).ok).toBe(true);
  });

  it("treats an absent port as 5432, the protocol default", () => {
    const verdict = inspectConnectionString("postgres://u:p@db.example.supabase.co/postgres");

    expect(verdict.ok).toBe(true);
    expect(verdict.port).toBe("5432");
  });

  it("refuses a transaction pooler flagged by query string rather than port", () => {
    // A proxy can present a transaction pooler on 5432, so the pgbouncer marker
    // has to be honoured independently of the port.
    for (const marker of ["pgbouncer=true", "pgbouncer=1", "pgbouncer=yes"]) {
      const verdict = inspectConnectionString(`${SESSION_POOLER}?${marker}`);
      expect(verdict.ok, marker).toBe(false);
      expect(verdict.reason, marker).toContain("pgbouncer=true");
    }
  });

  it("does not mistake pgbouncer=false for the transaction mode", () => {
    expect(inspectConnectionString(`${SESSION_POOLER}?pgbouncer=false`).ok).toBe(true);
  });

  it("ignores sslmode and other harmless query parameters", () => {
    expect(inspectConnectionString(`${SESSION_POOLER}?sslmode=require&application_name=migrate`).ok).toBe(true);
  });

  it("permits an explicit override, and reports that the pooler is in use", () => {
    // The escape hatch exists so a hard refusal cannot lock the team out of
    // running migrations at all, given the only URL available today is 6543.
    const verdict = inspectConnectionString(TRANSACTION_POOLER, { allowTransactionPooler: true });

    expect(verdict.ok).toBe(true);
    expect(verdict.transactionPooler).toBe(true);
  });

  it("refuses a non-postgres scheme", () => {
    const verdict = inspectConnectionString("mysql://u:p@host:3306/db");

    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("unsupported scheme");
  });

  it("refuses an unparseable string rather than guessing", () => {
    expect(inspectConnectionString("not a url").ok).toBe(false);
    expect(inspectConnectionString("").ok).toBe(false);
  });

  it("never leaks credentials into the verdict", () => {
    // The verdict is printed in an error message, so it must be safe to log.
    const verdict = inspectConnectionString("postgres://user:hunter2@host:6543/db");

    expect(JSON.stringify(verdict)).not.toContain("hunter2");
    expect(JSON.stringify(verdict)).not.toContain("user:");
  });
});

describe("migration advisory lock key", () => {
  it("is a bigint within Postgres's signed 64-bit advisory lock range", () => {
    expect(typeof MIGRATION_LOCK_KEY).toBe("bigint");
    expect(MIGRATION_LOCK_KEY).toBeGreaterThan(0n);
    // Signed 64-bit, so the magnitude must stay below 2^63.
    expect(MIGRATION_LOCK_KEY).toBeLessThan(2n ** 63n);
  });

  it("is the ASCII bytes of \"altusp\"", () => {
    // Locks live in a keyspace shared by every database on the server, so the
    // key must stay fixed across runs. Pinning the derivation documents intent
    // and catches an accidental change that would silently unlock a running
    // deployment's expectations.
    expect(MIGRATION_LOCK_KEY).toBe(0x616c74757370n);
    // Derived independently, so the assertion is not merely restating the
    // literal in the source.
    expect(MIGRATION_LOCK_KEY).toBe(BigInt(`0x${Buffer.from("altusp", "ascii").toString("hex")}`));
  });
});
