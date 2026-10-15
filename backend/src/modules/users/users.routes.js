const router = require("express").Router();
const {
  authenticate,
  administrator,
} = require("../../middleware/auth.middleware");
const schema = require("./users.schema");
const service = require("./users.service");
const { prisma } = require("../../lib/prisma");
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
router.use(authenticate, administrator);
router.get(
  "/roles",
  wrap(async (_req, res) =>
    res.json({
      success: true,
      data: (
        await prisma.rol.findMany({
          where: { activo: true },
          select: { id: true, nombre: true },
          orderBy: { nombre: "asc" },
        })
      ).map((rol) => ({ ...rol, id: String(rol.id) })),
    }),
  ),
);
router.get(
  "/",
  wrap(async (req, res) =>
    res.json({
      success: true,
      data: await service.list(schema.query.parse(req.query)),
    }),
  ),
);
router.get(
  "/:id",
  wrap(async (req, res) =>
    res.json({
      success: true,
      data: await service.getUser(schema.id.parse(req.params.id)),
    }),
  ),
);
router.post(
  "/",
  wrap(async (req, res) =>
    res.status(201).json({
      success: true,
      data: await service.create(schema.create.parse(req.body)),
    }),
  ),
);
router.patch(
  "/:id",
  wrap(async (req, res) =>
    res.json({
      success: true,
      data: await service.update(
        schema.id.parse(req.params.id),
        schema.update.parse(req.body),
        req.user,
      ),
    }),
  ),
);
router.patch(
  "/:id/estado",
  wrap(async (req, res) =>
    res.json({
      success: true,
      data: await service.update(
        schema.id.parse(req.params.id),
        require("zod")
          .z.object({ activo: require("zod").z.boolean() })
          .strict()
          .parse(req.body),
        req.user,
      ),
    }),
  ),
);
module.exports = { usersRouter: router, wrap };
