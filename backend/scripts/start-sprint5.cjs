require("./sprint5-target.cjs").configureSprint5();
const { ensureSprint5Database } = require("../src/modules/inventory/inventory.access");
ensureSprint5Database().then(() => require("../src/server")).catch(() => {
  console.error("Sprint 5 no pudo verificar la base aislada. Servidor no iniciado.");
  process.exitCode = 1;
  require("../src/lib/prisma").prisma.$disconnect();
});
