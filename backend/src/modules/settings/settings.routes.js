const router = require("express").Router();
const {
  authenticate,
  administrator,
} = require("../../middleware/auth.middleware");
router.use(authenticate, administrator);
router.get("/", (_req, res) =>
  res.json({
    success: true,
    data: {
      nombre: "Sistema de Inventario",
      organizacion: "Living Water Guatemala",
      dominio: "@water.cc",
      zonaHoraria: "America/Guatemala",
      inventarioDisponible: false,
    },
  }),
);
module.exports = { settingsRouter: router };
