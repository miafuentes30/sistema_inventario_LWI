require("./sprint5-target.cjs").configureSprint5();
const { spawnSync } = require("node:child_process");
const path = require("node:path");
let p;
(async () => {
  try {
    for (const operation of ["validate", "generate"]) {
      const result = spawnSync(process.execPath, [path.resolve(__dirname, "../node_modules/prisma/build/index.js"), operation,
        "--schema", path.resolve(__dirname, "../prisma/schema.prisma")], { cwd: path.resolve(__dirname, ".."),
        env: { ...process.env, PRISMA_GENERATE_SKIP_AUTOINSTALL: "1" }, windowsHide: true, stdio: "inherit" });
      if (result.status !== 0 || result.error) throw new Error("Prisma generation failed");
    }
    // Generation does not query or modify PostgreSQL. Verify the target using the
    // freshly generated client, including on first installation without a legacy client.
    p = new (require("../.sprint5-isolated/runtime-client").PrismaClient)({ log: [] });
    const [db] = await p.$queryRaw`SELECT current_database() AS name`;
    if (db.name !== "sistema_inventario_sprint5_test") throw new Error("Wrong database");
  } catch { console.error("No se pudo generar Prisma para la base aislada."); process.exitCode = 1; }
  finally { if (p) await p.$disconnect(); }
})();
