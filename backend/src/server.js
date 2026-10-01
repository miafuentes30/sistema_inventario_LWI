const { app } = require("./app");
const { env } = require("./config/env");
const { prisma } = require("./lib/prisma");

const server = app.listen(env.PORT, () => {
  console.log(`Servidor disponible en http://localhost:${env.PORT}`);
  console.log(`Health check: http://localhost:${env.PORT}/api/health`);
});

async function shutdown(signal) {
  console.log(`\n${signal} recibido. Cerrando servidor...`);

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
