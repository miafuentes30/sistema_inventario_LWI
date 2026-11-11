require("./sprint5-target.cjs").configureSprint5();
process.env.NODE_ENV = "test";
const path = require("node:path"), { spawnSync } = require("node:child_process");
const { prisma } = require("../src/lib/prisma");
(async () => { try {
  const [db] = await prisma.$queryRaw`SELECT current_database() AS name`;
  if (db.name !== "sistema_inventario_sprint5_test") throw new Error("Wrong database");
  await prisma.$disconnect();
  const ui = process.argv[2] === "frontend";
  const result = spawnSync(process.execPath, ["--test", ...(ui ? ["account-ui.test.mjs"] : ["auth.integration.test.cjs", "accounts.integration.test.cjs"])],
    { cwd: path.resolve(__dirname, ui ? "../../frontend" : ".."), env: process.env, windowsHide: true, stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} catch { console.error("Las pruebas requieren la base aislada verificada."); process.exitCode = 1; }
finally { await prisma.$disconnect(); } })();
