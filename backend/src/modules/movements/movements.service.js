const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../middleware/app-error");
async function capabilities() {
  const [state] = await prisma.$queryRaw`SELECT
    to_regclass('public.movimientos') IS NOT NULL AND to_regclass('public.movimiento_detalles') IS NOT NULL
    AND to_regclass('public.lotes') IS NOT NULL AND to_regclass('public.asientos_inventario') IS NOT NULL
    AND to_regclass('public.tipos_movimiento') IS NOT NULL AND to_regclass('public.documentos_movimiento') IS NOT NULL
    AND to_regclass('public.movimiento_eventos') IS NOT NULL AND to_regclass('public.ubicaciones') IS NOT NULL AS ready`;
  return { schemaReady: state.ready, enabled: false, needsMigration: !state.ready, confirmationAllowed: false,
    storageAvailable: false, openingRegistered: null, reason: !state.ready ? "MOVEMENT_MIGRATION_REQUIRED" : "MOVEMENT_ACTIVATION_REQUIRED" };
}
async function requireActivation() {
  const state = await capabilities();
  // This preparation stage must fail closed even if someone creates tables manually.
  throw new AppError(503, "El módulo requiere autorización de migración y activación.", state.reason);
}
function uploadUnavailable() { throw new AppError(503, "No hay almacenamiento aprobado para adjuntos.", "MOVEMENT_STORAGE_REQUIRED"); }
module.exports = { capabilities, requireActivation, uploadUnavailable };
