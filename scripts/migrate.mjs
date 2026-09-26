import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import postgres from "postgres";

const root = resolve(process.cwd());
const migrationsDir = resolve(root, "drizzle");

// Arbitrary but fixed. Postgres advisory locks are keyed by a signed 64-bit
// integer in a keyspace shared by every database on the server, so the value is
// derived from this project's name to avoid colliding with an unrelated app
// that happens to use a different lock. 0x616c74757370 is the ASCII bytes of
// "altusp".
export const MIGRATION_LOCK_KEY = 0x616c74757370n;

// `ALTER TYPE ... ADD VALUE` is only permitted inside a transaction block from
// PostgreSQL 12 onward; before that it fails outright. Five of the nineteen
// migrations here (0003, 0004, 0006, 0011, 0012) consist of exactly those
// statements, so running them transactionally against an older server would
// break them. Refusing is better than discovering it mid-release.
const MIN_SERVER_VERSION_NUM = 120000;

/**
 * Classifies a connection string for migration use. Pure: no I/O, no globals,
 * so it can be exhaustively unit tested without a database.
 *
 * Returns `{ ok: true }` for a connection that can safely run DDL, or
 * `{ ok: false, reason }` for one that cannot.
 *
 * The distinction that matters is PgBouncer in *transaction* mode, which
 * multiplexes many clients over few server connections and returns the server
 * connection to the pool at every transaction boundary. Session state does not
 * survive that: `SET`, temp tables, cursors and session-level advisory locks
 * all evaporate mid-script. This runner takes a session-level advisory lock to
 * serialise concurrent runs, and that lock is meaningless under a transaction
 * pooler -- two runs would each believe they held it. Supabase exposes this as
 * port 6543, and additionally marks it with `?pgbouncer=true`. The session
 * pooler on 5432 is fine and is the intended target.
 */
export function inspectConnectionString(url, { allowTransactionPooler = false } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "not a parseable URL" };
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    return { ok: false, reason: `unsupported scheme "${parsed.protocol}"` };
  }

  // An absent port means the protocol default, 5432, which is the direct or
  // session-pooler port and therefore safe.
  const port = parsed.port === "" ? "5432" : parsed.port;
  const markedPooler = /(?:^|[?&])pgbouncer=(?:true|1|yes)\b/i.test(parsed.search);
  const isTransactionPooler = port === "6543" || markedPooler;

  if (isTransactionPooler && !allowTransactionPooler) {
    return {
      ok: false,
      reason:
        port === "6543"
          ? "port 6543 is Supabase's transaction-mode pooler (PgBouncer), which cannot run DDL safely"
          : "the connection string is marked pgbouncer=true, i.e. transaction mode",
      port,
      host: parsed.hostname,
    };
  }

  return { ok: true, port, host: parsed.hostname, transactionPooler: isTransactionPooler };
}

/**
 * Resolves the connection string used for migrations.
 *
 * MIGRATION_DATABASE_URL is preferred over DATABASE_URL on purpose. The
 * application's DATABASE_URL points at Supabase's transaction-mode pooler,
 * which is correct for serving queries and wrong for schema changes, so
 * migrations need their own URL on the session pooler or the direct connection.
 */
function loadConnectionString() {
  if (process.env.MIGRATION_DATABASE_URL) return process.env.MIGRATION_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  if (existsSync(resolve(root, ".env"))) {
    const text = readFileSync(resolve(root, ".env"), "utf8");
    const match = text.match(/^(?:MIGRATION_DATABASE_URL|DATABASE_URL|SUPABASE_DB_URL)=(.*)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error(
    "MIGRATION_DATABASE_URL (or DATABASE_URL / SUPABASE_DB_URL) is required to run migrations"
  );
}

const journalPath = resolve(migrationsDir, "meta/_journal.json");
const journal = JSON.parse(readFileSync(journalPath, "utf8"));

const readMigrationFile = (entry) => readFileSync(resolve(migrationsDir, `${entry.tag}.sql`), "utf8");
const hashOf = (content) => createHash("sha256").update(content).digest("hex");
const normalizeHash = (value) => String(value ?? "").toLowerCase().replace(/^\\x/, "");

const splitStatements = (content) =>
  content
    .split(/--> statement-breakpoint|;\s*(?:\r?\n|$)/)
    .map((s) => s.trim().replace(/;+\s*$/, ""))
    .filter(Boolean);

const enumExists = (sql, name) => sql`select 1 from pg_type where typname = ${name} and typtype = 'e'`;
const enumLabels = (sql, name) => sql`select e.enumlabel from pg_type t join pg_enum e on e.enumtypid = t.oid where t.typname = ${name} order by e.enumsortorder`;
const tableExists = (sql, name) => sql`select 1 from information_schema.tables where table_schema='public' and table_name=${name}`;
const columnExists = (sql, table, column) => sql`select 1 from information_schema.columns where table_schema='public' and table_name=${table} and column_name=${column}`;
const constraintExists = (sql, table, name) => sql`select 1 from information_schema.table_constraints where constraint_schema='public' and table_name=${table} and constraint_name=${name}`;
const indexExists = (sql, name) => sql`select 1 from pg_indexes where schemaname='public' and indexname=${name}`;

async function ensureJournalTable(sql) {
  await sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`;
  await sql`CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" ("id" serial primary key, "hash" text not null, "created_at" bigint)`;
}

/**
 * Applies one migration inside an open transaction.
 *
 * Every statement AND the ledger row commit together or not at all. Previously
 * the DDL was applied in autocommit and the hash was written afterwards in a
 * separate statement, so a crash in between left schema changes on the server
 * that the ledger did not know about. The next run would then re-attempt the
 * migration and fail on "already exists" -- a state that needs manual repair.
 * With the ledger row inside the transaction, that window no longer exists.
 *
 * All statements are existence-checked first, so a re-run is a no-op rather
 * than an error, and a rolled-back migration leaves nothing behind to clean up.
 */
async function applyMigration(tx, entry) {
  const content = readMigrationFile(entry);
  for (const statement of splitStatements(content)) {
    const createEnum = statement.match(/^CREATE TYPE "?(?:public"?\.)?"?([a-z_]+)"? AS ENUM\(/);
    const alterEnum = statement.match(/^ALTER TYPE "?(?:public"?\.)?"?([a-z_]+)"? ADD VALUE(?: IF NOT EXISTS)? '([a-z_]+)'/);
    const createTable = statement.match(/^CREATE TABLE "?(?:public\.)?"?([a-z_]+)"? \(/);
    const addColumn = statement.match(/^ALTER TABLE "?(?:public\.)?"?([a-z_]+)"? ADD COLUMN "?([a-z_]+)"? /);
    const createIndex = statement.match(/^CREATE (UNIQUE )?INDEX "?([a-z_]+)"? ON /);

    if (createIndex) {
      const name = createIndex[2];
      if ((await indexExists(tx, name)).length) { console.log(`  - index ${name} already exists -> skip`); continue; }
      await tx.unsafe(statement);
      console.log(`  - index ${name} created`);
      continue;
    }
    if (createEnum) {
      const [typeName] = [createEnum[1]];
      const labels = (statement.match(/AS ENUM\(([\s\S]*)\)$/) ?? [])[1]
        .split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean);
      if ((await enumExists(tx, typeName)).length) {
        const existing = (await enumLabels(tx, typeName)).map((r) => r.enumlabel);
        for (const label of labels) {
          if (!existing.includes(label)) {
            await tx.unsafe(`ALTER TYPE "public"."${typeName}" ADD VALUE IF NOT EXISTS '${label}'`);
            console.log(`  - enum ${typeName} label '${label}' added`);
          } else {
            console.log(`  - enum ${typeName} label '${label}' present`);
          }
        }
        continue;
      }
      await tx.unsafe(statement);
      console.log(`  - type ${typeName} created`);
      continue;
    }
    if (alterEnum) {
      const [typeName, newLabel] = [alterEnum[1], alterEnum[2]];
      const existing = (await enumLabels(tx, typeName)).map((r) => r.enumlabel);
      if (existing.includes(newLabel)) { console.log(`  - enum ${typeName} label '${newLabel}' present -> skip`); continue; }
      // Note: the rewrite drops any `BEFORE`/`AFTER` ordering clause, so enum
      // label ORDER comes from the order these run in, not from the migration
      // file. Pre-existing behaviour, deliberately unchanged here.
      await tx.unsafe(`ALTER TYPE "public"."${typeName}" ADD VALUE IF NOT EXISTS '${newLabel}'`);
      console.log(`  - enum ${typeName} label '${newLabel}' added`);
      continue;
    }
    if (createTable) {
      const name = createTable[1];
      if ((await tableExists(tx, name)).length) { console.log(`  - table ${name} already exists -> skip`); continue; }
      await tx.unsafe(statement);
      console.log(`  - table ${name} created`);
      continue;
    }
    if (addColumn) {
      const [table, column] = [addColumn[1], addColumn[2]];
      if ((await columnExists(tx, table, column)).length) { console.log(`  - column ${table}.${column} already exists -> skip`); continue; }
      await tx.unsafe(statement);
      console.log(`  - column ${table}.${column} added`);
      continue;
    }
    const addConstraint = statement.match(/^ALTER TABLE "?(?:public\.)?"?([a-z_]+)"? ADD CONSTRAINT "?([a-z_]+)"? /);
    if (addConstraint) {
      const [table, name] = [addConstraint[1], addConstraint[2]];
      if ((await constraintExists(tx, table, name)).length) { console.log(`  - constraint ${name} already exists -> skip`); continue; }
      await tx.unsafe(statement);
      console.log(`  - constraint ${name} added on ${table}`);
      continue;
    }
    await tx.unsafe(statement);
  }
  await tx`insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values (${hashOf(content)}, ${BigInt(Date.now())})`;
  console.log(`  -> recorded ${entry.tag}.sql`);
}

async function run(connectionString) {
  const sql = postgres(connectionString, { max: 1, onnotice: () => {} });
  let holdsLock = false;
  try {
    // A transaction-mode pooler would silently break the advisory lock below, so
    // the connection is vetted before anything is applied.
    const verdict = inspectConnectionString(connectionString, {
      allowTransactionPooler: process.env.MIGRATION_ALLOW_TRANSACTION_POOLER === "1",
    });
    if (!verdict.ok) {
      throw new Error(
        `refusing to migrate over a transaction-mode connection: ${verdict.reason}.\n` +
          `  Set MIGRATION_DATABASE_URL to a session-pooler (port 5432) or direct connection.\n` +
          `  To override deliberately, set MIGRATION_ALLOW_TRANSACTION_POOLER=1 -- the advisory\n` +
          `  lock below will not be honoured, so concurrent runs will not be serialised.`
      );
    }
    if (verdict.transactionPooler) {
      console.warn(
        "[migrate] WARNING: MIGRATION_ALLOW_TRANSACTION_POOLER=1 overrides the transaction-pooler guard. " +
          "Concurrent runs will NOT be serialised."
      );
    }

    const [version] = await sql`select current_setting('server_version_num') as num`;
    if (Number(version.num) < MIN_SERVER_VERSION_NUM) {
      throw new Error(
        `this runner applies each migration in a transaction, which requires PostgreSQL 12 or ` +
          `newer because migrations 0003, 0004, 0006, 0011 and 0012 use ALTER TYPE ... ADD VALUE. ` +
          `Server reports ${version.num}.`
      );
    }

    // Try rather than blocking: two runs against one database can interleave
    // their existence probes and then collide on the same DDL. Failing fast
    // with a clear message beats hanging, and beats corrupting the outcome.
    const [lock] = await sql`select pg_try_advisory_lock(${MIGRATION_LOCK_KEY}) as acquired`;
    if (!lock.acquired) {
      throw new Error(
        "another migration run holds the advisory lock for this project, so this run was " +
          "refused rather than left to interleave with it. Wait for it to finish and retry."
      );
    }
    holdsLock = true;
    console.log(`[migrate] advisory lock acquired (key ${MIGRATION_LOCK_KEY})`);

    await ensureJournalTable(sql);
    const applied = await sql`select hash from "drizzle"."__drizzle_migrations"`;
    const appliedHashes = new Set(applied.map((row) => normalizeHash(row.hash)));

    for (const entry of journal.entries) {
      const hash = hashOf(readMigrationFile(entry));
      if (appliedHashes.has(hash)) {
        console.log(`skip  ${entry.tag}.sql (already applied)`);
        continue;
      }
      console.log(`apply ${entry.tag}.sql ...`);
      await sql.begin((tx) => applyMigration(tx, entry));
      appliedHashes.add(hash);
    }

    const final = await sql`select hash from "drizzle"."__drizzle_migrations"`;
    const finalHashes = new Set(final.map((row) => normalizeHash(row.hash)));
    let appliedCount = 0;
    for (const entry of journal.entries) {
      if (finalHashes.has(hashOf(readMigrationFile(entry)))) appliedCount += 1;
    }
    console.log(`\nmigrations applied/recorded: ${appliedCount}/${journal.entries.length}`);
  } finally {
    if (holdsLock) {
      await sql`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`.catch(() => {});
    }
    await sql.end();
  }
}

function main() {
  return run(loadConnectionString());
}

// Only executed when run directly. Without this guard, importing the module for
// its testable helpers would immediately start migrating.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
