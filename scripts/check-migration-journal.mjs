// Journal-completeness gate.
//
// scripts/migrate.mjs iterates _journal.json (line 52) and resolves each entry
// as drizzle/<tag>.sql (line 23). It never lists the drizzle/ directory. A .sql
// file with no journal entry is therefore never read, never applied, and fails
// silently in every environment -- which is exactly how
// drizzle/0020_detailed_ratings.sql shipped and took production down with
// SQLSTATE 42703 on every listing page.
//
// This check is the inverse: every drizzle/*.sql must have a journal entry.
// Top-level glob only, matching migrate.mjs's own path resolution, so a stray
// file in drizzle/meta/ or drizzle/migrations/ is never mistaken for one.
//
// No database access and no dependencies: it runs on every commit and in CI.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const JOURNAL_RELATIVE_PATH = "drizzle/meta/_journal.json";

const stripSqlExtension = (name) => name.replace(/\.sql$/, "");

/**
 * Pure comparison, exported so a test can drive it with fixtures that actually
 * violate the rule. On a clean repository both arrays come back empty, which
 * means a green run against the real tree proves nothing on its own -- the test
 * is what makes this gate falsifiable.
 *
 * @param {string[]} sqlFileNames e.g. ["0000_soft_skreet.sql", "0020_detailed_ratings.sql"]
 * @param {string[]} journalTags  e.g. ["0000_soft_skreet", "0020_detailed_ratings"]
 */
export function findJournalMismatches(sqlFileNames, journalTags) {
  const tags = new Set(journalTags);
  const stems = new Set(sqlFileNames.map(stripSqlExtension));

  return {
    // The dangerous direction: a migration that exists but is never applied.
    unjournaled: sqlFileNames.filter((name) => !tags.has(stripSqlExtension(name))),
    // The mirror image: an entry whose file is absent makes migrate.mjs throw
    // ENOENT at line 23 and abort the entire run.
    orphaned: journalTags.filter((tag) => !stems.has(tag)),
  };
}

function main() {
  const root = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
  const sqlFileNames = readdirSync(resolve(root, "drizzle")).filter((name) => name.endsWith(".sql"));
  const journal = JSON.parse(readFileSync(resolve(root, JOURNAL_RELATIVE_PATH), "utf8"));
  const journalTags = journal.entries.map((entry) => entry.tag);
  const { unjournaled, orphaned } = findJournalMismatches(sqlFileNames, journalTags);

  if (unjournaled.length === 0 && orphaned.length === 0) {
    console.log(`ok    ${sqlFileNames.length} migrations, all present in _journal.json`);
    return 0;
  }

  console.error("\nFAIL  drizzle/ and drizzle/meta/_journal.json are out of sync\n");

  if (unjournaled.length > 0) {
    console.error(`${unjournaled.length} migration file(s) with NO journal entry:`);
    for (const name of unjournaled) console.error(`        drizzle/${name}`);
    console.error(
      [
        "",
        "  migrate.mjs iterates _journal.json, not the drizzle/ directory (migrate.mjs:52),",
        "  and resolves entries as drizzle/<tag>.sql (migrate.mjs:23). An unjournaled file is",
        "  never read, never applied, and fails silently in every environment -- the schema",
        "  simply stays behind while the application code queries the new columns.",
        "",
        "  Fix: add one journal entry per file, e.g.",
        `      { "idx": ${journalTags.length}, "when": <epoch ms>, "tag": "${stripSqlExtension(unjournaled[0])}" }`,
        "",
        "  Or regenerate the file and the journal together:",
        "      pnpm exec drizzle-kit generate",
        "",
      ].join("\n")
    );
  }

  if (orphaned.length > 0) {
    console.error(`${orphaned.length} journal entr(ies) with NO migration file:`);
    for (const tag of orphaned) console.error(`        ${tag}  (expected drizzle/${tag}.sql)`);
    console.error(
      [
        "",
        "  migrate.mjs resolves every entry to drizzle/<tag>.sql (line 23) and would throw",
        "  ENOENT on the missing file, aborting the run before any later migration applies.",
        "",
      ].join("\n")
    );
  }

  return 1;
}

// Only run when executed directly, so the test can import the pure comparison
// above without triggering a check against the current working directory.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
