const path = require("node:path");
const assert = require("node:assert/strict");

function configureSprint5() {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
  const url = new URL(process.env.LWI_SPRINT5_DATABASE_URL || process.env.DATABASE_URL);
  if (!process.env.LWI_SPRINT5_DATABASE_URL) url.pathname = "/sistema_inventario_sprint5_test";
  assert.equal(decodeURIComponent(url.pathname.slice(1)), "sistema_inventario_sprint5_test", "Sprint 5 requires the authorized isolated database.");
  url.searchParams.delete("options");
  process.env.DATABASE_URL = url.href;
  process.env.LWI_DATABASE_MODE = "sprint5-test";
  process.env.PORT = process.env.SPRINT5_PORT || "3001";
  process.env.FRONTEND_URL = process.env.SPRINT5_FRONTEND_URL || "http://localhost:5174";
  return { database: "sistema_inventario_sprint5_test" };
}
module.exports = { configureSprint5 };
