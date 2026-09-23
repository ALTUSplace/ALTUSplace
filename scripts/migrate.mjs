import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import postgres from "postgres";

const root = resolve(process.cwd());
const migrationsDir = resolve(root, "drizzle");

function loadConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  if (existsSync(resolve(root, ".env"))) {
    const text = readFileSync(resolve(root, ".env"), "utf8");
    const match = text.match(/^(?:DATABASE_URL|SUPABASE_DB_URL)=(.*)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("DATABASE_URL (or SUPABASE_DB_URL) is required to run migrations");
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

async function run(connectionString) {
  const sql = postgres(connectionString, { max: 1, onnotice: () => {} });
  try {
    await ensureJournalTable(sql);
    const applied = await sql`select hash from "drizzle"."__drizzle_migrations"`;
    const appliedHashes = new Set(applied.map((row) => normalizeHash(row.hash)));

    for (const entry of journal.entries) {
      const content = readMigrationFile(entry);
      const hash = hashOf(content);
      if (appliedHashes.has(hash)) {
        console.log(`skip  ${entry.tag}.sql (already applied)`);
        continue;
      }
      console.log(`apply ${entry.tag}.sql ...`);
      for (const statement of splitStatements(content)) {
        const createEnum = statement.match(/^CREATE TYPE "?(?:public"?\.)?"?([a-z_]+)"? AS ENUM\(/);
        const alterEnum = statement.match(/^ALTER TYPE "?(?:public"?\.)?"?([a-z_]+)"? ADD VALUE(?: IF NOT EXISTS)? '([a-z_]+)'/);
        const createTable = statement.match(/^CREATE TABLE "?(?:public\.)?"?([a-z_]+)"? \(/);
        const addColumn = statement.match(/^ALTER TABLE "?(?:public\.)?"?([a-z_]+)"? ADD COLUMN "?([a-z_]+)"? /);
        const createIndex = statement.match(/^CREATE (UNIQUE )?INDEX "?([a-z_]+)"? ON /);

        if (createIndex) {
          const name = createIndex[2];
          if ((await indexExists(sql, name)).length) { console.log(`  - index ${name} already exists -> skip`); continue; }
          await sql.unsafe(statement);
          console.log(`  - index ${name} created`);
          continue;
        }
        if (createEnum) {
          const [typeName] = [createEnum[1]];
          const labels = (statement.match(/AS ENUM\(([\s\S]*)\)$/) ?? [])[1]
            .split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean);
          if ((await enumExists(sql, typeName)).length) {
            const existing = (await enumLabels(sql, typeName)).map((r) => r.enumlabel);
            for (const label of labels) {
              if (!existing.includes(label)) {
                await sql.unsafe(`ALTER TYPE "public"."${typeName}" ADD VALUE IF NOT EXISTS '${label}'`);
                console.log(`  - enum ${typeName} label '${label}' added`);
              } else {
                console.log(`  - enum ${typeName} label '${label}' present`);
              }
            }
            continue;
          }
          await sql.unsafe(statement);
          console.log(`  - type ${typeName} created`);
          continue;
        }
        if (alterEnum) {
          const [typeName, newLabel] = [alterEnum[1], alterEnum[2]];
          const existing = (await enumLabels(sql, typeName)).map((r) => r.enumlabel);
          if (existing.includes(newLabel)) { console.log(`  - enum ${typeName} label '${newLabel}' present -> skip`); continue; }
          await sql.unsafe(`ALTER TYPE "public"."${typeName}" ADD VALUE IF NOT EXISTS '${newLabel}'`);
          console.log(`  - enum ${typeName} label '${newLabel}' added`);
          continue;
        }
        if (createTable) {
          const name = createTable[1];
          if ((await tableExists(sql, name)).length) { console.log(`  - table ${name} already exists -> skip`); continue; }
          await sql.unsafe(statement);
          console.log(`  - table ${name} created`);
          continue;
        }
        if (addColumn) {
          const [table, column] = [addColumn[1], addColumn[2]];
          if ((await columnExists(sql, table, column)).length) { console.log(`  - column ${table}.${column} already exists -> skip`); continue; }
          await sql.unsafe(statement);
          console.log(`  - column ${table}.${column} added`);
          continue;
        }
        const addConstraint = statement.match(/^ALTER TABLE "?(?:public\.)?"?([a-z_]+)"? ADD CONSTRAINT "?([a-z_]+)"? /);
        if (addConstraint) {
          const [table, name] = [addConstraint[1], addConstraint[2]];
          if ((await constraintExists(sql, table, name)).length) { console.log(`  - constraint ${name} already exists -> skip`); continue; }
          await sql.unsafe(statement);
          console.log(`  - constraint ${name} added on ${table}`);
          continue;
        }
        await sql.unsafe(statement);
      }
      await sql`insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values (${hash}, ${BigInt(Date.now())})`;
      console.log(`  -> recorded ${entry.tag}.sql`);
    }

    const final = await sql`select hash from "drizzle"."__drizzle_migrations"`;
    const finalHashes = new Set(final.map((row) => normalizeHash(row.hash)));
    let appliedCount = 0;
    for (const entry of journal.entries) {
      if (finalHashes.has(hashOf(readMigrationFile(entry)))) appliedCount += 1;
    }
    console.log(`\nmigrations applied/recorded: ${appliedCount}/${journal.entries.length}`);
  } finally {
    await sql.end();
  }
}

run(loadConnectionString()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});