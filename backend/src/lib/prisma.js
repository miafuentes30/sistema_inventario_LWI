const runtimeAvailable = require("node:fs").existsSync(require("node:path").resolve(__dirname, "../../.sprint5-isolated/runtime-client/index.js"));
const { PrismaClient, Prisma } = process.env.LWI_DATABASE_MODE === "sprint5-test" || runtimeAvailable
  ? require("../../.sprint5-isolated/runtime-client")
  : require("@prisma/client");

const prisma = new PrismaClient();

module.exports = { prisma, Prisma };
