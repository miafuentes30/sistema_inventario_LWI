// Generates proposal files only. Never executes the generated SQL.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const backend = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(backend, ".env"), quiet: true });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({ log: [] });
const proposal = path.join(backend, "prisma/proposals/sprint5");
const active = path.join(backend, "prisma/schema.prisma");
const target = path.join(proposal, "schema.prisma");
const cli = path.join(backend, "node_modules/prisma/build/index.js");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: backend, windowsHide: true, timeout: 60000, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) throw new Error(`Prisma command failed: ${args.slice(0, 2).join(" ")}\n${result.stderr || result.error?.code || "Process unavailable"}`);
  return result.stdout.trim();
}
async function main() {
  const backupRoot = path.resolve(backend, "../.local-backups/sprint5");
  const latest = fs.readdirSync(backupRoot).sort().reverse().find(name => fs.existsSync(path.join(backupRoot, name, "verification.json")));
  if (!latest) throw new Error("A verified snapshot backup is required before generating migrations.");
  const backup = path.join(backupRoot, latest);
  const manifest = JSON.parse(fs.readFileSync(path.join(backup, "verification.json"), "utf8"));
  if (manifest.status !== "VERIFIED" || sha(fs.readFileSync(path.join(backup, "database.dump"))) !== manifest.sha256) throw new Error("Backup hash or verification failed.");
  const live = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const tables = await tx.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1");
    const fingerprints = await tx.$queryRawUnsafe(`SELECT 'rol' AS table_name, count(*)::text AS rows,
      md5(coalesce(string_agg(row_to_json(r)::text, E'\\n' ORDER BY id), '')) AS digest FROM public.rol r
      UNION ALL SELECT 'usuarios', count(*)::text,
      md5(coalesce(string_agg(row_to_json(u)::text, E'\\n' ORDER BY id), '')) FROM public.usuarios u`);
    return { tables, fingerprints };
  });
  if (JSON.stringify(live.tables.map(t => t.table_name)) !== JSON.stringify(["rol", "usuarios"])) throw new Error("Live tables changed; repeat diagnosis.");
  if (JSON.stringify(live.fingerprints) !== JSON.stringify(manifest.fingerprints)) throw new Error("Source data changed since backup; create a new backup.");
  run(["validate", "--schema", target]);
  const drift = run(["migrate", "diff", "--from-schema-datasource", active, "--to-schema-datamodel", active, "--script"]);
  if (!/^-- This is an empty migration\./.test(drift)) throw new Error("Live schema drift found; no SQL proposal generated.");
  const baseline = run(["migrate", "diff", "--from-empty", "--to-schema-datamodel", active, "--script"]);
  const delta = run(["migrate", "diff", "--from-schema-datamodel", active, "--to-schema-datamodel", target, "--script"]);
  const custom = fs.readFileSync(path.join(proposal, "constraints.sql"), "utf8");
  const ddl = delta + "\n\n" + custom;
  const withoutComments = ddl.replace(/--[^\n]*/g, "");
  if (/^\s*(DROP|TRUNCATE|DELETE|INSERT|UPDATE)\b/im.test(withoutComments)) throw new Error("Unexpected destructive/data-writing statement in proposal.");
  if (/\b(?:ALTER|CREATE)\s+TABLE\s+"(?:rol|usuarios)"/i.test(withoutComments)) throw new Error("Proposal tries to modify account tables.");
  const created = [...delta.matchAll(/CREATE TABLE "([^"]+)"/g)].map(m => m[1]);
  const header = "-- PROPOSAL ONLY. Do not apply until reviewed and approved.\n";
  const additive = header + "BEGIN;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';\n\n" + ddl + "\nCOMMIT;\n";
  const baseDir = path.join(proposal, "migrations/000_baseline");
  const deltaDir = path.join(proposal, "migrations/001_catalogos_terceros");
  fs.mkdirSync(baseDir, { recursive: true }); fs.mkdirSync(deltaDir, { recursive: true });
  fs.writeFileSync(path.join(baseDir, "migration.sql"), header + "-- On the existing database: mark baseline only AFTER approval; do not execute this SQL.\n" + baseline + "\n");
  fs.writeFileSync(path.join(deltaDir, "migration.sql"), additive);
  fs.writeFileSync(path.join(proposal, "migrations/migration_lock.toml"), 'provider = "postgresql"\n');
  fs.writeFileSync(path.join(proposal, "verification.json"), JSON.stringify({
    proposalOnly: true, inspectedAtUtc: new Date().toISOString(), database: manifest.database,
    backupVerified: true, backupRelativeDirectory: path.relative(path.resolve(backend, ".."), backup).replaceAll("\\", "/"),
    backupSha256: manifest.sha256, backupRestoreExecuted: false,
    sourceCounts: live.fingerprints.map(({ table_name, rows }) => ({ table: table_name, rows })),
    sourceMatchesBackup: true, liveSchemaMatchesActivePrisma: true, prismaSchemaValidated: true,
    createdTables: created, newTableCount: created.length,
    accountTableAlterations: false, destructiveStatements: false, dataLoadStatements: false,
    activeSchemaSha256: sha(fs.readFileSync(active)), proposalSchemaSha256: sha(fs.readFileSync(target)),
    baselineSqlSha256: sha(fs.readFileSync(path.join(baseDir, "migration.sql"))),
    additiveSqlSha256: sha(fs.readFileSync(path.join(deltaDir, "migration.sql"))),
    databaseMigrationApplied: false, databaseIntegrityTestsExecuted: false,
    limitations: ["SQL execution and restoration deliberately deferred to an isolated database after approval.", "CHECK/expression-index/trigger behavior has not been verified by execution."]
  }, null, 2) + "\n");
  console.log(JSON.stringify({ proposalOnly: true, prismaSchemaValidated: true, liveSchemaDrift: false,
    newTables: created, migrationsApplied: false, report: path.join(proposal, "verification.json") }, null, 2));
}
main().catch(error => {
  // Avoid accidentally exposing a connection URL from a failed engine command.
  console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED_DATABASE_URL]"));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
