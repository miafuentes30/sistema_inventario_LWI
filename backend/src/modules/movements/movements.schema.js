const { z } = require("zod");
const { id } = require("../inventory/inventory.schema");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v + "T00:00:00Z"); return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10) === v; });
const quantity = z.string().regex(/^\d{1,15}(\.\d{1,3})?$/).refine(v => /^\d{1,15}(\.\d{1,3})?$/.test(v) && BigInt(v.replace(".", "")) > 0n);
const cost = z.string().regex(/^\d{1,12}(\.\d{1,6})?$/);
const text = max => z.string().trim().max(max).optional().default("");
const line = z.object({ productId: id, unitId: id, locationId: id.nullable().optional(), lotId: id.nullable().optional(),
  quantity, requestedQuantity: quantity.nullable().optional(), unitCost: cost.nullable().optional(),
  lotCode: text(100), expiryDate: date.nullable().optional() }).strict();
const movement = z.object({ typeId: id, date, warehouseId: id, supplierId: id.nullable().optional(), responsibleId: id,
  requesterId: id.nullable().optional(), requesterName: text(200), position: text(160), declaredClass: text(160),
  project: text(100), purpose: text(1000), receivedBy: text(200), documentNumber: text(100), notes: text(4000),
  documents: z.array(z.object({ type: z.string().trim().min(1).max(40), number: z.string().trim().min(1).max(100), issuedAt: date.nullable().optional() }).strict()).max(20).default([]),
  lines: z.array(line).min(1).max(100), idempotencyKey: z.string().uuid()
}).strict().superRefine((value, ctx) => {
  const keys = value.lines.map(l => [l.productId,l.locationId || "",l.lotId || "",l.lotCode,l.expiryDate || ""].join(":"));
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: ["lines"], message: "Duplicate lines" });
});
const query = z.object({ buscar: text(180), desde: date.optional(), hasta: date.optional(), tipoId: id.optional(), proveedorId: id.optional(),
  solicitante: text(200), bodegaId: id.optional(), estado: z.enum(["BORRADOR","PENDIENTE","CONFIRMADO","CANCELADO"]).optional(),
  pagina: z.coerce.number().int().min(1).default(1), limite: z.coerce.number().int().min(1).max(100).default(10)
}).strict().refine(v => !v.desde || !v.hasta || v.desde <= v.hasta);
const confirmation = z.object({ confirmed: z.literal(true), version: z.number().int().positive(), idempotencyKey: z.string().uuid() }).strict();
module.exports = { movement, line, quantity, cost, date, query, confirmation, id };
