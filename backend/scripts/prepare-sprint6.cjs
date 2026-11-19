// Read-only inspection and private backup. Never creates/applies a migration.
require("./sprint5-target.cjs").configureSprint5();
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { prisma } = require("../src/lib/prisma");
const directory = path.resolve(__dirname, "../../.local-backups/sprint6", new Date().toISOString().replace(/[:.]/g, "-"));
const url = new URL(process.env.DATABASE_URL), user = decodeURIComponent(url.username);
function command(args, input, output) {
  const result = spawnSync("docker", ["exec", "-i", "--user", "postgres", process.env.LWI_BACKUP_CONTAINER || "postgres-lwi", ...args],
    { windowsHide: true, timeout: 60000, stdio: [input ?? "ignore", output ?? "pipe", "pipe"] });
  if (result.error || result.status !== 0) throw new Error("Backup utility failed");
  return result.stdout?.toString("utf8").trim();
}
(async () => { try {
  assert.equal(url.pathname, "/sistema_inventario_sprint5_test");
  fs.mkdirSync(directory, { recursive: true });
  const dump = path.join(directory, "database.dump");
  let report;
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const [db] = await tx.$queryRaw`SELECT current_database() AS name`; assert.equal(db.name, url.pathname.slice(1));
    const [cluster] = await tx.$queryRaw`SELECT system_identifier::text AS id FROM pg_control_system()`;
    assert.equal(cluster.id, command(["psql", "-X", "-U", user, "-d", db.name, "-Atc", "SELECT system_identifier::text FROM pg_control_system()"]));
    const [snapshot] = await tx.$queryRaw`SELECT pg_export_snapshot() AS id`;
    const tables = await tx.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1`;
    const migrations = await tx.$queryRaw`SELECT migration_name,finished_at FROM "_prisma_migrations" ORDER BY 1`;
    const fd = fs.openSync(dump, "wx");
    try { command(["pg_dump", "-U", user, "-d", db.name, "--no-owner", "--no-acl", "--format=custom", `--snapshot=${snapshot.id}`], undefined, fd); }
    finally { fs.closeSync(fd); }
    report = { database: db.name, capturedAtUtc: new Date().toISOString(), tables, migrations, restored: false, structureChanged: false };
  }, { timeout: 120000 });
  const fd = fs.openSync(dump, "r");
  try { command(["pg_restore", "--file=/dev/null"], fd); } finally { fs.closeSync(fd); }
  report.sha256 = createHash("sha256").update(fs.readFileSync(dump)).digest("hex");
  report.bytes = fs.statSync(dump).size; report.archiveDecoded = true;
  fs.writeFileSync(path.join(directory, "verification.json"), JSON.stringify(report, null, 2), { flag: "wx" });
  fs.writeFileSync(path.join(directory, "database.dump.sha256"), report.sha256 + "  database.dump\n", { flag: "wx" });
  console.log(JSON.stringify({ database: report.database, directory, bytes: report.bytes, sha256: report.sha256, archiveDecoded: true, restored: false, structureChanged: false }));
} catch { console.error("Sprint 6: respaldo no verificado; no se realizaron cambios estructurales."); process.exitCode = 1; }
finally { await prisma.$disconnect(); } })();
