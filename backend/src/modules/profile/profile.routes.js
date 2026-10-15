const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const { authenticate } = require("../../middleware/auth.middleware");
const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../middleware/app-error");
const { wrap } = require("../users/users.routes");
const { select, serialize } = require("../users/users.service");
const { nombre, changePassword } = require("../users/users.schema");
const { z } = require("zod");
router.use(authenticate);
router.get("/", (req, res) => {
  const { passwordHash, rolId, updatedAt, ...user } = req.user;
  res.json({
    success: true,
    data: serialize({
      ...user,
      rol: { id: user.rol.id, nombre: user.rol.nombre },
    }),
  });
});
router.patch(
  "/",
  wrap(async (req, res) => {
    const input = z.object({ nombre }).strict().parse(req.body);
    res.json({
      success: true,
      data: serialize(
        await prisma.usuario.update({
          where: { id: req.user.id },
          data: { ...input, updatedAt: new Date() },
          select,
        }),
      ),
    });
  }),
);
router.post(
  "/contrasena",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      success: false,
      message: "Demasiados intentos. Intenta nuevamente más tarde.",
    },
  }),
  wrap(async (req, res) => {
    const input = changePassword.parse(req.body);
    if (!(await bcrypt.compare(input.actual, req.user.passwordHash)))
      throw new AppError(
        400,
        "La contraseña actual es incorrecta.",
        "WRONG_PASSWORD",
      );
    if (await bcrypt.compare(input.nueva, req.user.passwordHash))
      throw new AppError(
        400,
        "La nueva contraseña debe ser diferente.",
        "SAME_PASSWORD",
      );
    const passwordHash = await bcrypt.hash(input.nueva, 12);
    const result = await prisma.usuario.updateMany({
      where: { id: req.user.id, passwordHash: req.user.passwordHash },
      data: { passwordHash, updatedAt: new Date() },
    });
    if (!result.count)
      throw new AppError(
        409,
        "La cuenta cambi?. Inicia sesión nuevamente.",
        "CONFLICT",
      );
    res.json({
      success: true,
      message:
        "Contraseña actualizada. Inicia sesión nuevamente en todos tus dispositivos.",
    });
  }),
);
module.exports = { profileRouter: router };
