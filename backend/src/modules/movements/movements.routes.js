const { Router } = require("express");
const { authenticate, administrator } = require("../../middleware/auth.middleware");
const { isolated, readable } = require("../inventory/inventory.access");
const { wrap } = require("../users/users.routes");
const schema = require("./movements.schema"), service = require("./movements.service");
const router = Router();
router.use(["/entradas", "/salidas", "/inventario-movimientos"], isolated, authenticate, readable);
router.get("/inventario-movimientos/capacidades", wrap(async (_req,res) => res.json({ success: true, data: await service.capabilities() })));
for (const resource of ["entradas","salidas"]) {
  router.get(`/${resource}`, wrap(async req => { schema.query.parse(req.query); await service.requireActivation(); }));
  router.get(`/${resource}/:id`, wrap(async req => { schema.id.parse(req.params.id); await service.requireActivation(); }));
  router.post(`/${resource}`, administrator, wrap(async req => { schema.movement.parse(req.body); await service.requireActivation(); }));
  router.patch(`/${resource}/:id`, administrator, wrap(async req => { schema.id.parse(req.params.id); schema.movement.parse(req.body); await service.requireActivation(); }));
  router.post(`/${resource}/:id/confirmar`, administrator, wrap(async req => { schema.id.parse(req.params.id); schema.confirmation.parse(req.body); await service.requireActivation(); }));
  router.post(`/${resource}/:id/adjuntos`, administrator, wrap(async req => { schema.id.parse(req.params.id); service.uploadUnavailable(); }));
}
for (const suffix of ["movimientos","existencias"]) router.get(`/productos/:id/${suffix}`, isolated, authenticate, readable, wrap(async req => { schema.id.parse(req.params.id); await service.requireActivation(); }));
module.exports = { movementsRouter: router };
