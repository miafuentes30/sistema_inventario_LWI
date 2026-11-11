// Read-only verification; never applies migrations or seeds.
require("./sprint5-target.cjs").configureSprint5();
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { PrismaClient } = require("../.sprint5-isolated/runtime-client");
const p = new PrismaClient({ log: [] });
(async () => {
  try {
    const [target] = await p.$queryRaw`SELECT current_database() AS name`;
    if (target.name !== "sistema_inventario_sprint5_test") throw new Error("Wrong database");
    const history = await p.$queryRaw`SELECT migration_name, finished_at IS NOT NULL AS finished FROM "_prisma_migrations" ORDER BY migration_name`;
    console.log(JSON.stringify({ database: target.name, migrations: history }));
    const result = spawnSync(process.execPath, [path.resolve(__dirname, "../node_modules/prisma/build/index.js"), "migrate", "diff",
      "--from-url", process.env.DATABASE_URL, "--to-schema-datamodel", path.resolve(__dirname, "../prisma/schema.prisma"), "--exit-code"],
    { cwd: path.resolve(__dirname, ".."), env: process.env, windowsHide: true, encoding: "utf8" });
    // Never print command arguments or connection strings.
    if (result.status !== 0 || result.error) throw new Error("Schema drift or verification failure");
    console.log("Prisma: sin diferencias estructurales.");
  } catch { console.error("No se pudo confirmar la correspondencia del esquema aislado."); process.exitCode = 1; }
  finally { await p.$disconnect(); }
})();
