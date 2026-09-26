import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// This gate cannot be validated by running it against the repository, because
// the repository is consistent: 19 files, 19 journal entries, so the check
// passes trivially and a buggy implementation would also pass. Each case below
// therefore drives the real CLI against a synthetic tree that actually violates
// the rule, and asserts on the exit code and the exact filenames reported.
//
// Spawning the CLI (rather than importing the pure comparison) is deliberate:
// exit code and stderr text are precisely the contract that the pre-commit hook
// and the CI step depend on, so that is what gets tested.
const SCRIPT = resolve(import.meta.dirname, "check-migration-journal.mjs");
const REPO_ROOT = resolve(import.meta.dirname, "..");

type Result = { status: number; stdout: string; stderr: string };

const fixtures: string[] = [];

function runScript(options: { root?: string; cwd?: string } = {}): Result {
  const args = options.root ? [SCRIPT, options.root] : [SCRIPT];
  try {
    const stdout = execFileSync(process.execPath, args, {
      cwd: options.cwd ?? REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failure.status ?? -1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

/** Builds a throwaway drizzle/ tree with the given .sql files and journal tags. */
function makeFixture(sqlFiles: string[], journalTags: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "journal-gate-"));
  fixtures.push(root);
  mkdirSync(join(root, "drizzle", "meta"), { recursive: true });
  for (const name of sqlFiles) writeFileSync(join(root, "drizzle", name), "-- fixture migration\n");
  writeFileSync(
    join(root, "drizzle", "meta", "_journal.json"),
    JSON.stringify(
      {
        version: "7",
        dialect: "postgresql",
        entries: journalTags.map((tag, idx) => ({ idx, when: 1_700_000_000_000 + idx, tag })),
      },
      null,
      2
    )
  );
  return root;
}

afterAll(() => {
  for (const root of fixtures) rmSync(root, { recursive: true, force: true });
});

describe("migration journal completeness", () => {
  it("fails and names the exact file when a .sql has no journal entry", () => {
    // This is the exact shape of the incident: 0020 shipped as a file and was
    // never registered, so migrate.mjs never read it.
    const root = makeFixture(["0018_add_widget.sql", "0019_add_gadget.sql"], ["0018_add_widget"]);

    const result = runScript({ root });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("drizzle/0019_add_gadget.sql");
    expect(result.stderr).not.toContain("drizzle/0018_add_widget.sql");
  });

  it("lists every unregistered file, not just the first", () => {
    const root = makeFixture(["0001_a.sql", "0002_b.sql", "0003_c.sql"], ["0001_a"]);

    const result = runScript({ root });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("drizzle/0002_b.sql");
    expect(result.stderr).toContain("drizzle/0003_c.sql");
    expect(result.stderr).toContain("2 migration file(s) with NO journal entry");
  });

  it("fails when a journal entry has no matching .sql file", () => {
    // migrate.mjs resolves every entry to drizzle/<tag>.sql, so this would
    // throw ENOENT and abort the run before any later migration applied.
    const root = makeFixture(["0001_a.sql"], ["0001_a", "0002_vanished"]);

    const result = runScript({ root });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("0002_vanished");
    expect(result.stderr).toContain("expected drizzle/0002_vanished.sql");
  });

  it("passes on a consistent tree", () => {
    const root = makeFixture(["0001_a.sql", "0002_b.sql"], ["0001_a", "0002_b"]);

    const result = runScript({ root });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("2 migrations");
  });

  it("ignores .sql files outside the top level of drizzle/", () => {
    // migrate.mjs only ever resolves drizzle/<tag>.sql, so a nested file is not
    // a migration and must not be reported as one.
    const root = makeFixture(["0001_a.sql"], ["0001_a"]);
    mkdirSync(join(root, "drizzle", "migrations"), { recursive: true });
    writeFileSync(join(root, "drizzle", "migrations", "nested.sql"), "-- not a migration\n");

    const result = runScript({ root });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("agrees with the real repository, via the default working directory", () => {
    // No root argument: this is exactly how the pre-commit hook and the CI step
    // invoke it, so the cwd-relative default path is covered too.
    const result = runScript({ cwd: REPO_ROOT });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
