const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
const { PrismaClient } = require("@prisma/client");
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.pathname, "/sistema_inventario");
url.searchParams.set("options", "-c default_transaction_read_only=on");
const p = new PrismaClient({ datasources: { db: { url: url.href } }, log: [] });
const file = path.resolve(__dirname, "../../.local-backups/sprint5-backend-integration/source-before.json");
(async () => { try {
  const snapshot = await p.$transaction(async t => {
    await t.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return {
      tables: await t.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1"),
      columns: await t.$queryRawUnsafe("SELECT table_name,column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position"),
      constraints: await t.$queryRawUnsafe("SELECT c.relname,con.conname,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY 1,2"),
      indexes: await t.$queryRawUnsafe("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2"),
      sequences: await t.$queryRawUnsafe("SELECT 'rol_id_seq' AS name,last_value::text,is_called FROM rol_id_seq UNION ALL SELECT 'usuarios_id_seq',last_value::text,is_called FROM usuarios_id_seq"),
      rows: await t.$queryRawUnsafe(`SELECT 'rol' AS table_name,count(*)::text AS count,md5(coalesce(string_agg(row_to_json(r)::text,E'\\n' ORDER BY id),'')) AS digest FROM rol r UNION ALL SELECT 'usuarios',count(*)::text,md5(coalesce(string_agg(row_to_json(u)::text,E'\\n' ORDER BY id),'')) FROM usuarios u`),
    };
  });
  snapshot.envHash = createHash("sha256").update(fs.readFileSync(path.resolve(__dirname, "../.env"))).digest("hex");
  assert.deepEqual(snapshot.tables.map(t => t.table_name), ["rol", "usuarios"]);
  if (process.argv[2] === "capture") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), { flag: "wx" });
  } else assert.deepEqual(snapshot, JSON.parse(fs.readFileSync(file, "utf8")));
  console.log(JSON.stringify({ principal: "sistema_inventario", readOnly: true, captured: process.argv[2] === "capture", verifiedUnchanged: process.argv[2] !== "capture", rows: snapshot.rows.map(({ table_name, count }) => ({ table: table_name, count })) }));
} catch (e) { console.error(JSON.stringify({ auditFailed: true, code: e.code || e.name })); process.exitCode = 1; }
finally { await p.$disconnect(); } })();
