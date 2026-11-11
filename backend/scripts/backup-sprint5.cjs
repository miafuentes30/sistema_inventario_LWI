// Read-only snapshot backup. Does not create a database or apply migrations.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({ log: [] });
const container = process.env.LWI_BACKUP_CONTAINER || "postgres-lwi";
const root = path.resolve(__dirname, "../../.local-backups/sprint5");
const target = path.join(root, new Date().toISOString().replace(/[:.]/g, "-"));
const connection = new URL(process.env.DATABASE_URL);
const dbName = decodeURIComponent(connection.pathname.slice(1));
const user = decodeURIComponent(connection.username);
const base = ["exec", "--user", "postgres", container];

function command(args, { inputFile, outputFile } = {}) {
  const input = inputFile ? fs.openSync(inputFile, "r") : null;
  const output = outputFile ? fs.openSync(outputFile, "wx") : null;
  try {
    const result = spawnSync("docker", [...base, ...args], {
      windowsHide: true,
      timeout: 60000,
      stdio: [input ?? "ignore", output ?? "pipe", "pipe"],
    });
    if (result.error || result.status !== 0) {
      // Do not print connection strings, database contents or credentials.
      throw new Error(`Backup command failed (${result.error?.code || result.status}): ${args[0]}`);
    }
    return result.stdout?.toString("utf8").trim();
  } finally {
    if (input !== null) fs.closeSync(input);
    if (output !== null) fs.closeSync(output);
  }
}

async function fingerprint(tx) {
  return tx.$queryRawUnsafe(`SELECT 'rol' AS table_name, count(*)::text AS rows,
    md5(coalesce(string_agg(row_to_json(r)::text, E'\\n' ORDER BY id), '')) AS digest FROM public.rol r
    UNION ALL SELECT 'usuarios', count(*)::text,
    md5(coalesce(string_agg(row_to_json(u)::text, E'\\n' ORDER BY id), '')) FROM public.usuarios u`);
}

async function main() {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(connection.hostname)) {
    throw new Error("This backup procedure is restricted to the inspected local PostgreSQL instance.");
  }
  fs.mkdirSync(target, { recursive: true });
  const dump = path.join(target, "database.dump");
  let report;
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const [identity] = await tx.$queryRawUnsafe("SELECT system_identifier::text AS id FROM pg_control_system()");
    const containerIdentity = command(["psql", "-X", "-U", user, "-d", dbName, "-At", "-c", "SELECT system_identifier::text FROM pg_control_system()"]);
    if (identity.id !== containerIdentity) throw new Error("Container and configured database are different clusters.");
    const [snapshot] = await tx.$queryRawUnsafe("SELECT pg_export_snapshot() AS id");
    const tables = await tx.$queryRawUnsafe("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('information_schema','pg_catalog') AND table_type='BASE TABLE' ORDER BY 1,2");
    const before = await fingerprint(tx);
    const dumpVersion = command(["pg_dump", "--version"]);
    const args = ["pg_dump", "-U", user, "-d", dbName, "--no-owner", "--no-acl", `--snapshot=${snapshot.id}`];
    command([...args, "--format=custom"], { outputFile: dump });
    command([...args, "--schema-only"], { outputFile: path.join(target, "schema.sql") });
    const digest = createHash("sha256").update(fs.readFileSync(dump)).digest("hex");
    fs.writeFileSync(path.join(target, "database.dump.sha256"), `${digest}  database.dump\n`, { flag: "wx" });
    report = { database: dbName, capturedAtUtc: new Date().toISOString(), dumpVersion,
      tables, fingerprints: before, bytes: fs.statSync(dump).size, sha256: digest,
      consistentSnapshot: true, databaseWrites: false, status: "CAPTURED" };
  }, { isolationLevel: "RepeatableRead", timeout: 180000 });

  // Stream the archive through pg_restore stdin. It never connects to a database.
  // -i is required to forward the archive; Docker otherwise closes stdin.
  base.splice(1, 0, "-i");
  command(["pg_restore", "--list"], { inputFile: dump, outputFile: path.join(target, "archive-list.txt") });
  command(["pg_restore", "--no-owner", "--no-acl", "--file=/dev/null"], { inputFile: dump });
  const after = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return fingerprint(tx);
  });
  const list = fs.readFileSync(path.join(target, "archive-list.txt"), "utf8");
  if (!["TABLE DATA public rol", "TABLE DATA public usuarios"].every(entry => list.includes(entry))) {
    throw new Error("Archive does not contain both existing tables' data.");
  }
  if (JSON.stringify(after) !== JSON.stringify(report.fingerprints)) {
    throw new Error("Source records changed during inspection; review concurrent application activity.");
  }
  report = { ...report, status: "VERIFIED", archiveListReadable: true, fullArchiveDecoded: true,
    sourceRowsUnchanged: true, restoreExecuted: false,
    limitation: "Archive decoded without errors; a restore into an isolated database has not been performed." };
  fs.writeFileSync(path.join(target, "verification.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ status: report.status, backupDirectory: target, bytes: report.bytes,
    sha256: report.sha256, rows: report.fingerprints.map(({ table_name, rows }) => ({ table: table_name, rows })),
    restoreExecuted: false }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({ status: "FAILED", code: error.code, message: error.message?.startsWith("Backup command") ? error.message : "Backup not verified; no migrations were executed." }));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
