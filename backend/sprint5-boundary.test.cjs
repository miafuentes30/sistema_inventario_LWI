const { test } = require("node:test");
const assert = require("node:assert/strict");
delete process.env.LWI_DATABASE_MODE;
const { app } = require("./src/app");
const { prisma } = require("./src/lib/prisma");

test("Legacy profile blocks Sprint 5 before database access and preserves account routing", async () => {
  const server = app.listen(0, "127.0.0.1"); await new Promise(r => server.once("listening", r));
  try {
    for (const route of ["/productos", "/proveedores", "/marcas", "/catalogos/categorias"]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`);
      assert.equal(response.status, 503); assert.equal((await response.json()).code, "ISOLATED_DATABASE_REQUIRED");
    }
    for (const route of ["/usuarios", "/perfil"]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`);
      assert.equal(response.status, 401);
    }
  } finally { await new Promise(r => server.close(r)); await prisma.$disconnect(); }
});
test("Sprint 5 launcher refuses an explicit principal URL", () => {
  const before = process.env.DATABASE_URL;
  process.env.LWI_SPRINT5_DATABASE_URL = before;
  try { assert.throws(() => require("./scripts/sprint5-target.cjs").configureSprint5(), /authorized isolated database/); }
  finally { delete process.env.LWI_SPRINT5_DATABASE_URL; }
  assert.equal(process.env.DATABASE_URL, before);
});
