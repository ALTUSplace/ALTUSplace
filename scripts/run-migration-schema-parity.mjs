// Migration/schema parity: orchestrates an ephemeral Postgres and compares what
// the migrations build against what drizzle/schema.ts declares.
//
// Written in Node rather than bash on purpose. A bash version works on the CI
// runner but is not runnable on a Windows checkout without Git Bash on PATH,
// which makes `pnpm check:schema-parity` fail confusingly for the maintainer.
// Every other verification script here is Node, so this matches the convention
// and drops the shell dependency entirely.
//
// Nothing touches a real database. Both databases live inside an ephemeral
// container that is force-removed on exit, including on failure or Ctrl-C.
//
// Side 1: replay every migration from scratch via scripts/migrate.mjs -- the
//         same journal-driven runner production uses, deliberately, so a bug in
//         the real runner is caught rather than papered over by a bespoke replay.
// Side 2: apply `drizzle-kit export` output, which renders drizzle/schema.ts to
//         SQL and needs no connection string at all.
// Then:   compare the two resulting catalogs (see verify-migration-schema-parity.mjs).
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const IMAGE = "postgres:16-alpine";
const CONTAINER = `altus-parity-${process.pid}`;
const PASSWORD = "parity";
const USER = "postgres";
const PORT = process.env.PARITY_PORT ?? "55432";
const ROOT = resolve(import.meta.dirname, "..");

let tempDir;

function log(message) {
  process.stdout.write(`\n==> ${message}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) {
    // Returned rather than thrown, so the caller's own capability probe can
    // decide what a missing binary means. Throwing here would defeat the
    // no-docker check below.
    return { error: result.error, status: null, stdout: "", stderr: "" };
  }
  return result;
}

/** Runs a command and aborts the whole gate if it fails, echoing its output. */
function runOrFail(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.error) throw new Error(`${command} could not be run: ${result.error.message}`);
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
  }
  return result;
}

const dockerExec = (args, options = {}) => run("docker", ["exec", CONTAINER, ...args], options);

function cleanup() {
  // Never let a teardown failure mask the real result. `docker rm -f` against an
  // already-removed container is not an error here.
  run("docker", ["rm", "-f", CONTAINER]);
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
}

function waitForPostgres() {
  // Readiness is polled rather than slept on, so a slow machine cannot produce a
  // false pass and a fast one is not penalised with a fixed sleep.
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    if (dockerExec(["pg_isready", "-U", USER]).status === 0) return;
    if (attempt === 60) {
      const logs = dockerExec(["logs", CONTAINER]);
      process.stderr.write(`${logs.stdout ?? ""}${logs.stderr ?? ""}`);
      throw new Error("postgres never became ready");
    }
    spawnSync(process.execPath, ["-e", "setTimeout(()=>{},1000)"]);
  }
}

function main() {
  // Fail safe and legibly when there is no container runtime, rather than
  // crashing halfway through with a spawn error.
  const probe = run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  if (probe.error || probe.status !== 0) {
    process.stderr.write(
      "docker is not available, so the migration/schema parity gate cannot run.\n" +
        "This gate needs a container runtime; it is expected on GitHub Actions ubuntu runners.\n"
    );
    return 2;
  }

  const migratedUrl = `postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/migrated`;
  const declaredUrl = `postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/declared`;

  try {
    log(`starting ephemeral postgres (${IMAGE}) on port ${PORT}`);
    runOrFail("docker", [
      "run",
      "--detach",
      "--rm",
      "--name",
      CONTAINER,
      "--env",
      `POSTGRES_PASSWORD=${PASSWORD}`,
      "--env",
      `POSTGRES_USER=${USER}`,
      "--publish",
      `127.0.0.1:${PORT}:5432`,
      IMAGE,
    ]);

    log("waiting for postgres to accept connections");
    waitForPostgres();
    dockerExec(["createdb", "-U", USER, "migrated"]);
    dockerExec(["createdb", "-U", USER, "declared"]);

    // ---- side 1: replay every migration from scratch ------------------------
    log("side 1/2: replaying all migrations from scratch (scripts/migrate.mjs)");
    runOrFail(process.execPath, ["scripts/migrate.mjs"], {
      cwd: ROOT,
      env: {
        ...process.env,
        DATABASE_URL: migratedUrl,
        // Pinned explicitly, not merely inherited. migrate.mjs prefers
        // MIGRATION_DATABASE_URL over DATABASE_URL, so without this a
        // developer's own migration URL would silently take over and this
        // "ephemeral" replay would run against a real database.
        MIGRATION_DATABASE_URL: migratedUrl,
        // Cleared so the run always takes the strict path. Inheriting an
        // override would mean CI and a local run exercise different code.
        MIGRATION_ALLOW_TRANSACTION_POOLER: undefined,
      },
    });

    // ---- side 2: apply what drizzle/schema.ts declares ----------------------
    log("side 2/2: exporting drizzle/schema.ts to SQL via drizzle-kit export");
    const exported = runOrFail(
      process.execPath,
      ["node_modules/drizzle-kit/bin.cjs", "export", "--schema=./drizzle/schema.ts", "--dialect=postgresql"],
      { cwd: ROOT }
    );

    tempDir = mkdtempSync(join(tmpdir(), "altus-parity-"));
    const sqlPath = join(tempDir, "declared.sql");
    // A ~25KB string, far below spawnSync's 2MB default cap. Copied into the
    // container and run with `psql -f` rather than piped through stdin, so the
    // failure mode is identical on every platform.
    writeFileSync(sqlPath, exported.stdout);
    runOrFail("docker", ["cp", sqlPath, `${CONTAINER}:/tmp/declared.sql`]);

    log("applying the exported schema to the second database");
    runOrFail("docker", [
      "exec",
      CONTAINER,
      "psql",
      "-U",
      USER,
      "-d",
      "declared",
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
      "-f",
      "/tmp/declared.sql",
    ]);

    // ---- compare ------------------------------------------------------------
    log("comparing the two catalogs");
    const comparison = run(process.execPath, ["scripts/verify-migration-schema-parity.mjs", migratedUrl, declaredUrl], {
      cwd: ROOT,
    });
    process.stdout.write(comparison.stdout ?? "");
    process.stderr.write(comparison.stderr ?? "");
    return comparison.status ?? 1;
  } catch (error) {
    process.stderr.write(`\n${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    cleanup();
  }
}

process.exit(main());
