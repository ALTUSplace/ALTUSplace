// Migration/schema parity: compares the catalog produced by replaying every
// migration from scratch against the catalog produced by applying the schema
// that drizzle/schema.ts declares.
//
// Why catalogs and not SQL text: Postgres normalises DDL on the way in. A CHECK
// written as `CHECK (a) AND (b)` comes back out of pg_get_constraintdef fully
// parenthesised; identity columns, defaults and index definitions are all
// canonicalised. So the two sides can never be compared as text -- but once
// both have been through Postgres, the resulting catalogs are directly
// comparable, and a difference there is a real difference rather than a
// formatting artefact.
//
// This is the invariant that matters. drizzle/schema.ts is what the application
// reads; the migrations are what actually build the database. When they drift,
// queries fail at runtime in production -- which is exactly how
// SQLSTATE 42703 took every listing page down.
//
// One deliberate exclusion: index NAMES are not compared. See stripIndexName
// below for why that is noise rather than signal. Nothing else is excluded --
// every table, column, type, nullability, default, enum label, primary key,
// foreign key, unique constraint, CHECK and index body is compared.
//
// Usage: node scripts/verify-migration-schema-parity.mjs <urlMigrated> <urlDeclared>
// Exits 0 when the two catalogs are equivalent, 1 when they differ.
import postgres from "postgres";

/**
 * Removes the index name from a pg_indexes.indexdef rendering.
 *
 * Index names are cosmetic for this gate, and comparing them produces diffs
 * that cannot fail at runtime. A primary key's backing index is named either
 * after its constraint, or -- when the constraint is left unnamed -- by
 * Postgres' own `<table>_pkey` default. So the same logical index can
 * legitimately appear under two different names purely depending on which
 * source declared it. That is not hypothetical: the first CI run of this gate
 * found exactly one difference in 609 catalog lines, and it was this --
 * `drizzle/0014_add_favorites.sql` names its constraint
 * `favorites_favorite_id_pk` while `drizzle/schema.ts` leaves it unnamed, so
 * drizzle-kit's export lets Postgres default to `favorites_pkey`. No foreign
 * key depends on a PK's index name and no query references it; the only
 * observable difference is in `\d` output.
 *
 * What is deliberately preserved: the method (btree/hash/gist), uniqueness, and
 * the exact column list. Those are the properties that change query behaviour,
 * so a real index regression is still caught.
 *
 * The name may be double-quoted and may itself contain spaces, so both the
 * quoted and bare forms are matched rather than assuming a plain identifier.
 */
export function stripIndexName(indexdef) {
  // Group 1 deliberately excludes the space after INDEX, so that the leading
  // space of group 2 supplies it. Including it in both would leave a doubled
  // space in the output and make the two sides of a comparison differ for a
  // reason that has nothing to do with the schema.
  return String(indexdef).replace(/^(CREATE (?:UNIQUE )?INDEX) (?:"[^"]*"|\S+)( ON )/, "$1$2");
}

// Written out explicitly rather than generated: each entry is a deliberate
// choice about what counts as schema, and a reviewer should be able to read
// exactly what is being compared. A section may supply `rowToLine` when the
// meaningful comparison needs to be assembled or normalised in JS rather than
// read straight out of one SQL expression.
const QUERIES = [
  {
    label: "tables",
    sql: `select table_name as line from information_schema.tables
           where table_schema='public' and table_type='BASE TABLE'
           order by table_name`,
  },
  {
    label: "columns",
    sql: `select table_name || '.' || column_name
                 || ' type=' || data_type
                 || coalesce('(' || udt_name || ')', '')
                 || ' null=' || is_nullable
                 || coalesce(' default=' || column_default, '') as line
            from information_schema.columns
           where table_schema='public'
           order by table_name, ordinal_position`,
  },
  {
    label: "enum types and labels",
    sql: `select 'type=' || t.typname || ' label=' || e.enumlabel as line
            from pg_type t
            join pg_enum e on e.enumtypid = t.oid
            join pg_namespace n on n.oid = t.typnamespace
           where n.nspname = 'public'
           order by t.typname, e.enumsortorder`,
  },
  {
    label: "primary keys",
    sql: `select 'pk ' || c.relname || ' ' || a.attname as line
            from pg_constraint con
            join pg_class c on c.oid = con.conrelid
            join pg_namespace n on n.oid = c.relnamespace
            join unnest(con.conkey) with ordinality as k(attnum, ord) on true
            join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
           where n.nspname='public' and con.contype='p'
           order by c.relname, k.ord`,
  },
  {
    label: "foreign keys",
    // pg_get_constraintdef is used rather than the raw columns because it
    // carries the match and delete actions, which a column list would lose.
    sql: `select 'fk ' || c.relname || ' ' || pg_get_constraintdef(con.oid) as line
            from pg_constraint con
            join pg_class c on c.oid = con.conrelid
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname='public' and con.contype='f'
           order by c.relname, pg_get_constraintdef(con.oid)`,
  },
  {
    label: "unique constraints",
    sql: `select 'uq ' || c.relname || ' ' || pg_get_constraintdef(con.oid) as line
            from pg_constraint con
            join pg_class c on c.oid = con.conrelid
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname='public' and con.contype='u'
           order by c.relname, pg_get_constraintdef(con.oid)`,
  },
  {
    label: "check constraints",
    // This section is the one that would have caught the invalid CHECK in
    // drizzle/0020_detailed_ratings.sql at CI time rather than in production.
    sql: `select 'ck ' || c.relname || ' ' || con.conname || ' ' || pg_get_constraintdef(con.oid) as line
            from pg_constraint con
            join pg_class c on c.oid = con.conrelid
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname='public' and con.contype='c'
           order by c.relname, con.conname`,
  },
  {
    label: "indexes (names ignored, method/columns/uniqueness compared)",
    sql: `select indexdef
            from pg_indexes
           where schemaname='public'`,
    // Ordering is done in JS rather than with `order by indexname`, because the
    // name is about to be discarded: ordering by a value that is then thrown
    // away would leave the two sides ordered differently for no reason.
    rowToLine: (row) => `ix ${stripIndexName(row.indexdef)}`,
  },
];

/** Serialises one database's catalog into a stable, line-oriented document. */
export async function dumpCatalog(url) {
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 20 });
  const lines = [];
  try {
    for (const { label, sql: query, rowToLine } of QUERIES) {
      lines.push(`--- ${label} ---`);
      const rows = await sql.unsafe(query);
      // Sorted in JS so the document is deterministic regardless of what the
      // SQL happened to order by. The diff below is set-based, so this affects
      // only readability of the report, never the verdict.
      const rendered = rows.map((row) => (rowToLine ? rowToLine(row) : String(row.line))).sort();
      lines.push(...rendered);
    }
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
  return lines;
}

/** Lines present in one document but not the other, in stable order. */
export function diffCatalogs(migrated, declared) {
  const migratedSet = new Set(migrated);
  const declaredSet = new Set(declared);
  return {
    // Present when the migrations were replayed: something a migration creates
    // that drizzle/schema.ts no longer describes.
    onlyInMigrations: migrated.filter((l) => !declaredSet.has(l)),
    // Present when the schema was declared: a column, constraint or enum label
    // the application believes exists but no migration creates.
    onlyInSchema: declared.filter((l) => !migratedSet.has(l)),
  };
}

async function main() {
  const [urlMigrated, urlDeclared] = process.argv.slice(2);
  if (!urlMigrated || !urlDeclared) {
    console.error("usage: node scripts/verify-migration-schema-parity.mjs <urlMigrated> <urlDeclared>");
    return 2;
  }

  console.log("dumping catalog from migrations replayed from scratch ...");
  const migrated = await dumpCatalog(urlMigrated);
  console.log("dumping catalog from drizzle/schema.ts applied via drizzle-kit export ...");
  const declared = await dumpCatalog(urlDeclared);

  const { onlyInMigrations, onlyInSchema } = diffCatalogs(migrated, declared);

  console.log(`\nmigrated catalog: ${migrated.length} lines`);
  console.log(`declared catalog: ${declared.length} lines`);

  if (onlyInMigrations.length === 0 && onlyInSchema.length === 0) {
    console.log("\nPARITY OK -- the migrations build exactly the schema drizzle/schema.ts declares.");
    return 0;
  }

  console.error("\nPARITY FAILED -- migrations and drizzle/schema.ts disagree.\n");
  if (onlyInSchema.length) {
    console.error(`${onlyInSchema.length} line(s) in drizzle/schema.ts but NOT produced by the migrations:`);
    for (const l of onlyInSchema) console.error(`  + ${l}`);
    console.error("\n  The application reads these from the schema, but replaying the migrations");
    console.error("  does not create them. In production this is a runtime query failure.\n");
  }
  if (onlyInMigrations.length) {
    console.error(`${onlyInMigrations.length} line(s) produced by the migrations but NOT in drizzle/schema.ts:`);
    for (const l of onlyInMigrations) console.error(`  - ${l}`);
    console.error("\n  A migration creates these, but the schema does not describe them.\n");
  }
  return 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href) {
  process.exit(await main());
}
