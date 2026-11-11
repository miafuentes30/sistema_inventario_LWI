// Authorized isolated rehearsal only. Never deploys to the principal database.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const backend = path.resolve(__dirname, "..");
const root = path.resolve(backend, "..");
require("dotenv").config({ path: path.join(backend, ".env"), quiet: true });
const { PrismaClient } = require("@prisma/client");
const proposal = path.join(backend, "prisma/proposals/sprint5");
const principalName = "sistema_inventario";
const testName = process.env.LWI_SPRINT5_TEST_DB || "sistema_inventario_sprint5_test";
assert.match(testName, /^sistema_inventario_sprint5_test(?:_[a-z0-9_]+)?$/);
assert.notEqual(testName, principalName);
const originalUrl = new URL(process.env.DATABASE_URL);
assert.equal(decodeURIComponent(originalUrl.pathname.slice(1)), principalName);
const principalUrl = new URL(originalUrl);
principalUrl.searchParams.set("options", "-c default_transaction_read_only=on");
const testUrl = new URL(originalUrl); testUrl.pathname = "/" + testName;
testUrl.searchParams.delete("options");
const adminUrl = new URL(originalUrl); adminUrl.pathname = "/postgres";
adminUrl.searchParams.delete("options");
const principal = new PrismaClient({ datasources: { db: { url: principalUrl.href } }, log: [] });
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.href } }, log: [] });
let testClient;
const resumeRunId = process.argv[2] === "--resume" ? process.argv[3] : null;
if (resumeRunId) assert.match(resumeRunId, /^\d{4}-\d{2}-\d{2}T[\d-]+Z$/);
const runId = resumeRunId || new Date().toISOString().replace(/[:.]/g, "-");
const runDir = path.join(root, ".local-backups/sprint5-validation", runId);
const workspace = path.join(runDir, "workspace");
const sha = data => createHash("sha256").update(data).digest("hex");
const fileHash = file => fs.existsSync(file) ? sha(fs.readFileSync(file)) : null;
const previousReport = resumeRunId ? JSON.parse(fs.readFileSync(path.join(runDir, "report.json"), "utf8")) : null;
if (previousReport) {
  assert.equal(previousReport.testDatabase, testName);
  assert.equal(previousReport.testDatabaseCreated, true);
  assert.equal(previousReport.restoration?.passed, true);
  assert.equal(previousReport.migrations?.passed, true);
  assert.equal(previousReport.principalUnchanged, true);
  fs.writeFileSync(path.join(runDir, `report-before-resume-${Date.now()}.json`), JSON.stringify(previousReport, null, 2));
}
const report = previousReport ? { ...previousReport, status: "RUNNING", tests: [], problems: [],
  resolvedProblems: [...(previousReport.resolvedProblems || []), ...previousReport.problems], resumedAfterContentVerification: false } : { runId, principalDatabase: principalName, testDatabase: testName,
  status: "RUNNING", tests: [], problems: [], principalMigrationExecuted: false };
const q = text => `'${String(text).replaceAll("'", "''")}'`;
let before;

function save() {
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
function command(exe, args, options = {}) {
  const result = spawnSync(exe, args, { windowsHide: true, cwd: backend, timeout: 120000,
    encoding: "utf8", maxBuffer: 8 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    const error = String(result.stderr || result.error?.code || result.stdout || result.status)
      .replace(/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED_DATABASE_URL]");
    throw new Error(`${path.basename(exe)} ${args.slice(0, 2).join(" ")}: ${error}`);
  }
  return (result.stdout || "").trim();
}
function prisma(args) {
  // The proposal datasource has a different env var; even .env loading cannot redirect it.
  return command(process.execPath, [path.join(backend, "node_modules/prisma/build/index.js"), ...args], {
    env: { ...process.env, DATABASE_URL: testUrl.href, SPRINT5_TEST_DATABASE_URL: testUrl.href,
      PRISMA_GENERATE_SKIP_AUTOINSTALL: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1", CHECKPOINT_DISABLE: "1" },
  });
}
function docker(args, inputFile) {
  const fd = inputFile ? fs.openSync(inputFile, "r") : null;
  try {
    return command("docker", ["exec", ...(inputFile ? ["-i"] : []), "--user", "postgres",
      process.env.LWI_BACKUP_CONTAINER || "postgres-lwi", ...args],
    inputFile ? { stdio: [fd, "pipe", "pipe"] } : {});
  } finally { if (fd !== null) fs.closeSync(fd); }
}

async function inspect(client) {
  return client.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return {
      tables: await tx.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1"),
      columns: await tx.$queryRawUnsafe("SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default,character_maximum_length,numeric_precision,numeric_scale,datetime_precision FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position"),
      constraints: await tx.$queryRawUnsafe("SELECT c.relname AS table_name,co.conname AS name,co.contype AS type,co.convalidated AS validated,pg_get_constraintdef(co.oid) AS definition FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY 1,2"),
      indexes: await tx.$queryRawUnsafe("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2"),
      functions: await tx.$queryRawUnsafe("SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY 1"),
      triggers: await tx.$queryRawUnsafe("SELECT c.relname AS table_name,t.tgname,pg_get_triggerdef(t.oid) AS definition,t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1,2"),
      sequences: await tx.$queryRawUnsafe("SELECT 'rol_id_seq' AS name,last_value::text,is_called FROM public.rol_id_seq UNION ALL SELECT 'usuarios_id_seq',last_value::text,is_called FROM public.usuarios_id_seq"),
      fingerprints: await tx.$queryRawUnsafe(`SELECT 'rol' AS table_name,count(*)::text AS rows,
        md5(coalesce(string_agg(row_to_json(r)::text,E'\\n' ORDER BY id),'')) AS digest FROM public.rol r
        UNION ALL SELECT 'usuarios',count(*)::text,md5(coalesce(string_agg(row_to_json(u)::text,E'\\n' ORDER BY id),'')) FROM public.usuarios u`),
    };
  });
}

async function main() {
  const proposalReport = JSON.parse(fs.readFileSync(path.join(proposal, "verification.json"), "utf8"));
  const backupDir = path.resolve(root, proposalReport.backupRelativeDirectory);
  const backup = JSON.parse(fs.readFileSync(path.join(backupDir, "verification.json"), "utf8"));
  const dump = path.join(backupDir, "database.dump");
  assert.equal(backup.status, "VERIFIED");
  assert.equal(fileHash(dump), backup.sha256);
  assert.equal(backup.sha256, proposalReport.backupSha256);
  for (const [file, key] of [["schema.prisma", "proposalSchemaSha256"],
    ["migrations/000_baseline/migration.sql", "baselineSqlSha256"],
    ["migrations/001_catalogos_terceros/migration.sql", "additiveSqlSha256"]]) {
    assert.equal(fileHash(path.join(proposal, file)), proposalReport[key], `Proposal changed: ${file}`);
  }
  report.protectedFilesBefore = Object.fromEntries(["prisma/schema.prisma", ".env", "package.json", "package-lock.json",
    "node_modules/.prisma/client/schema.prisma"].map(file => [file, fileHash(path.join(backend, file))]));
  before = await inspect(principal);
  assert.deepEqual(before.tables.map(t => t.table_name), ["rol", "usuarios"]);
  assert.deepEqual(before.fingerprints, backup.fingerprints);
  const exists = await admin.$queryRawUnsafe("SELECT datname FROM pg_database WHERE datname=$1", testName);
  assert.equal(exists.length, resumeRunId ? 1 : 0, "Unexpected test database existence: refuse to reuse or delete it.");
  const [cluster] = await principal.$queryRawUnsafe("SELECT system_identifier::text AS id FROM pg_control_system()");
  const user = decodeURIComponent(originalUrl.username);
  assert.equal(docker(["psql", "-X", "-U", user, "-d", principalName, "-At", "-c",
    "SELECT system_identifier::text FROM pg_control_system()"]), cluster.id);
  report.preflight = { backupSha256: backup.sha256, proposalHashesMatch: true,
    principalMatchesBackup: true, testDatabaseDidNotExistAtCreation: true,
    resumingKnownRun: Boolean(resumeRunId), samePostgresCluster: true };
  save();
  console.log(JSON.stringify({ stage: "preflight", principal: principalName, testDatabase: testName, resuming: Boolean(resumeRunId), backupVerified: true }));

  const [locale] = await principal.$queryRawUnsafe("SELECT pg_encoding_to_char(encoding) AS encoding,datcollate,datctype FROM pg_database WHERE datname=current_database()");
  // Identifier is strictly validated above. This admin session connects to postgres, never principal.
  if (!resumeRunId) await admin.$executeRawUnsafe(`CREATE DATABASE "${testName}" TEMPLATE template0 ENCODING ${q(locale.encoding)} LC_COLLATE ${q(locale.datcollate)} LC_CTYPE ${q(locale.datctype)}`);
  report.testDatabaseCreated = true; save();
  testClient = new PrismaClient({ datasources: { db: { url: testUrl.href } }, log: [] });
  const [identity] = await testClient.$queryRawUnsafe("SELECT current_database() AS name");
  assert.equal(identity.name, testName);
  if (!resumeRunId) {
    assert.equal((await testClient.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).length, 0);
    docker(["pg_restore", "-U", user, "-d", testName, "--exit-on-error", "--single-transaction", "--no-owner", "--no-acl"], dump);
    assert.deepEqual(await inspect(testClient), before, "Restored data/structure must exactly match source and backup.");
  } else {
    const content = await inspect(testClient);
    assert.deepEqual(content.fingerprints, before.fingerprints);
    assert.deepEqual(content.sequences, before.sequences);
    assert.deepEqual(content.tables.map(t => t.table_name), ["_prisma_migrations", ...proposalReport.createdTables, "rol", "usuarios"].sort());
    for (const table of proposalReport.createdTables) {
      const [row] = await testClient.$queryRawUnsafe(`SELECT count(*)::text AS count FROM "${table}"`);
      assert.equal(row.count, "0", `Refuse resume: ${table} contains records to preserve.`);
    }
    report.resumedAfterContentVerification = true;
  }
  report.restoration = { passed: true, tables: ["rol", "usuarios"], dataSchemaAndSequencesMatch: true,
    counts: before.fingerprints.map(({ table_name, rows }) => ({ table: table_name, rows })) };
  save(); console.log(JSON.stringify({ stage: resumeRunId ? "verify-restored-content" : "restore", passed: true }));

  fs.mkdirSync(workspace, { recursive: true });
  let schema = fs.readFileSync(path.join(proposal, "schema.prisma"), "utf8");
  schema = schema.replace('provider = "prisma-client-js"', 'provider = "prisma-client-js"\n  output = "../generated-client"')
    .replace('env("DATABASE_URL")', 'env("SPRINT5_TEST_DATABASE_URL")');
  const schemaFile = path.join(workspace, "schema.prisma");
  fs.writeFileSync(schemaFile, schema);
  const baselineSchema = path.join(workspace, "baseline.prisma");
  fs.writeFileSync(baselineSchema, fs.readFileSync(path.join(backend, "prisma/schema.prisma"), "utf8")
    .replace('env("DATABASE_URL")', 'env("SPRINT5_TEST_DATABASE_URL")'));
  fs.cpSync(path.join(proposal, "migrations"), path.join(workspace, "migrations"), { recursive: true });
  prisma(["validate", "--schema", schemaFile]);
  if (!resumeRunId) {
    const baselineDiff = prisma(["migrate", "diff", "--from-schema-datasource", baselineSchema,
      "--to-schema-datamodel", baselineSchema, "--script"]);
    assert.match(baselineDiff, /^-- This is an empty migration\./);
    report.baselineMatchesRestoredStructure = true;
    fs.writeFileSync(path.join(runDir, "baseline-diff.sql"), baselineDiff + "\n");
    fs.writeFileSync(path.join(runDir, "resolve.log"), prisma(["migrate", "resolve", "--applied", "000_baseline", "--schema", schemaFile]));
    fs.writeFileSync(path.join(runDir, "deploy.log"), prisma(["migrate", "deploy", "--schema", schemaFile]));
  } else {
    assert.equal(previousReport.baselineMatchesRestoredStructure, true);
    assert.match(fs.readFileSync(path.join(runDir, "baseline-diff.sql"), "utf8"), /^-- This is an empty migration\./);
  }
  const history = await testClient.$queryRawUnsafe('SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NULL AS not_rolled_back FROM "_prisma_migrations" ORDER BY migration_name');
  assert.deepEqual(history.map(h => h.migration_name), ["000_baseline", "001_catalogos_terceros"]);
  for (const h of history) {
    assert.equal(h.finished && h.not_rolled_back, true);
    assert.equal(h.checksum, fileHash(path.join(proposal, "migrations", h.migration_name, "migration.sql")));
  }
  const migrated = await inspect(testClient);
  assert.deepEqual(migrated.fingerprints, before.fingerprints);
  assert.deepEqual(migrated.sequences, before.sequences);
  const created = migrated.tables.map(t => t.table_name).filter(t => !["rol", "usuarios", "_prisma_migrations"].includes(t));
  assert.deepEqual(created, [...proposalReport.createdTables].sort());
  assert.equal(migrated.tables.length, 16);
  for (const key of ["columns", "constraints", "indexes", "triggers"]) {
    const filtered = migrated[key].filter(x => ["rol", "usuarios"].includes(x.table_name || x.tablename));
    assert.deepEqual(filtered, before[key], `Existing accounts changed: ${key}`);
  }
  const sql = fs.readFileSync(path.join(proposal, "migrations/001_catalogos_terceros/migration.sql"), "utf8");
  const expectedConstraints = [...sql.matchAll(/CONSTRAINT "([^"]+)"/g)].map(m => m[1]);
  for (const name of expectedConstraints) assert.ok(migrated.constraints.some(c => c.name === name && c.validated), `Missing/unvalidated constraint ${name}`);
  const expectedIndexes = [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)].map(m => m[1]);
  for (const name of expectedIndexes) assert.ok(migrated.indexes.some(i => i.indexname === name), `Missing index ${name}`);
  assert.equal(migrated.triggers.length, 13);
  assert.ok(migrated.triggers.every(t => t.tgenabled === "O"));
  report.migrations = { passed: true, baselineMarkedOnly: true, appliedOnlyAdditive: true,
    createdTables: created, totalTablesIncludingHistory: migrated.tables.length,
    expectedConstraintsVerified: expectedConstraints.length, expectedIndexesVerified: expectedIndexes.length,
    updateTriggersVerified: migrated.triggers.length, history };
  const schemaDiff = prisma(["migrate", "diff", "--from-schema-datasource", schemaFile, "--to-schema-datamodel", schemaFile, "--script"]);
  fs.writeFileSync(path.join(runDir, "schema-diff.sql"), schemaDiff + "\n");
  assert.match(schemaDiff, /^-- This is an empty migration\./);
  fs.writeFileSync(path.join(runDir, "status.log"), prisma(["migrate", "status", "--schema", schemaFile]));
  // Prisma resolves the installed generator relative to the schema, so keep this
  // temporary generation schema under backend while its output stays isolated.
  const generationDir = path.join(backend, ".sprint5-isolated", runId);
  fs.mkdirSync(generationDir, { recursive: true });
  const generationSchema = path.join(generationDir, "schema.prisma");
  fs.writeFileSync(generationSchema, schema.replace('output = "../generated-client"',
    `output = "${path.join(runDir, "generated-client").replaceAll("\\", "/")}"`));
  fs.writeFileSync(path.join(runDir, "generate.log"), prisma(["generate", "--schema", generationSchema]));
  report.prisma = { schemaValid: true, noUnexpectedStructuralDrift: true, clientGeneratedInIsolatedDirectory: true };
  save(); console.log(JSON.stringify({ stage: "migrations-and-client", passed: true, newTables: created.length }));

  const { PrismaClient: IsolatedClient } = require(path.join(runDir, "generated-client"));
  const generated = new IsolatedClient({ datasources: { db: { url: testUrl.href } }, log: [] });
  try { await require("./sprint5-integrity.cjs").runIntegrity(generated, testName, report); }
  finally { await generated.$disconnect(); }
  assert.ok(report.tests.length > 0);
  assert.equal(report.tests.filter(t => !t.passed).length, 0, "Integrity tests failed.");
  assert.deepEqual((await inspect(testClient)).fingerprints, before.fingerprints);
  report.newTableRowsAfterTests = [];
  for (const table of created) {
    const [row] = await testClient.$queryRawUnsafe(`SELECT count(*)::text AS count FROM "${table}"`);
    assert.equal(row.count, "0", `Fixtures were not rolled back in ${table}`);
    report.newTableRowsAfterTests.push({ table, rows: row.count });
  }
  report.status = "PASSED";
}

main().catch(error => {
  report.status = "FAILED";
  report.problems.push(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED_DATABASE_URL]"));
  process.exitCode = 1;
}).finally(async () => {
  try {
    if (before) {
      assert.deepEqual(await inspect(principal), before, "Principal changed during validation.");
      report.principalUnchanged = true;
    }
    if (report.protectedFilesBefore) {
      for (const [file, hash] of Object.entries(report.protectedFilesBefore)) {
        assert.equal(fileHash(path.join(backend, file)), hash, `Protected file changed: ${file}`);
      }
      report.activeSchemaEnvAndClientUnchanged = true;
    }
  } catch (error) { report.status = "FAILED"; report.problems.push(error.message); process.exitCode = 1; }
  save();
  console.log(JSON.stringify({ status: report.status, principal: principalName, test: testName,
    principalUnchanged: report.principalUnchanged, testsPassed: report.tests.filter(t => t.passed).length,
    testsFailed: report.tests.filter(t => !t.passed).length, problems: report.problems,
    report: path.join(runDir, "report.json") }, null, 2));
  await Promise.allSettled([principal.$disconnect(), admin.$disconnect(), testClient?.$disconnect()]);
});
