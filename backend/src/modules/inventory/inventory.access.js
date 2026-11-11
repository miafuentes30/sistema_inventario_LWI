const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../middleware/app-error");
const readRoles = ["Administrador", "Compras", "Finanzas", "Solicitante"];
const canWrite = user => user?.rol?.nombre === "Administrador";
let checked;
async function ensureSprint5Database() {
  if (process.env.LWI_DATABASE_MODE !== "sprint5-test" ||
      decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)) !== "sistema_inventario_sprint5_test") {
    throw new AppError(503, "Este módulo requiere el entorno aislado de Sprint 5.", "ISOLATED_DATABASE_REQUIRED");
  }
  if (!checked) checked = prisma.$queryRaw`SELECT current_database() AS name`.then(([db]) => {
    if (db.name !== "sistema_inventario_sprint5_test") throw new Error("Wrong database");
  }).catch(() => { checked = null; throw new AppError(503, "No fue posible verificar el entorno aislado.", "ISOLATED_DATABASE_REQUIRED"); });
  await checked;
}
async function isolated(req, res, next) { try { await ensureSprint5Database(); next(); } catch (e) { next(e); } }
function readable(req, res, next) {
  if (!readRoles.includes(req.user?.rol?.nombre)) return next(new AppError(403, "No tienes permisos para este módulo.", "FORBIDDEN"));
  next();
}
module.exports = { ensureSprint5Database, isolated, readable, canWrite };
