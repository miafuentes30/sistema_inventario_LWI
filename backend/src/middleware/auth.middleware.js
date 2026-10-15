const jwt = require("jsonwebtoken");
const { createHash } = require("node:crypto");
const { env } = require("../config/env");
const { prisma } = require("../lib/prisma");
const { AppError } = require("./app-error");
const credentialVersion = (hash) =>
  createHash("sha256").update(hash).digest("hex");
async function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    let claims;
    try {
      claims = jwt.verify(token || "", env.JWT_SECRET, {
        algorithms: ["HS256"],
      });
    } catch {
      throw new AppError(
        401,
        "La sesión venci?. Inicia sesión nuevamente.",
        "SESSION_EXPIRED",
      );
    }
    if (!/^\d+$/.test(claims.sub || ""))
      throw new AppError(401, "Sesión inválida.", "SESSION_EXPIRED");
    const user = await prisma.usuario.findUnique({
      where: { id: BigInt(claims.sub) },
      include: { rol: true },
    });
    if (
      !user?.activo ||
      !user.rol.activo ||
      claims.cv !== credentialVersion(user.passwordHash)
    ) {
      throw new AppError(401, "La sesión ya no es válida.", "SESSION_EXPIRED");
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
function administrator(req, res, next) {
  if (req.user.rol.nombre !== "Administrador")
    return next(
      new AppError(
        403,
        "No tienes permisos para administrar el sistema.",
        "FORBIDDEN",
      ),
    );
  next();
}
module.exports = { authenticate, administrator, credentialVersion };
