const { z } = require("zod");
const id = z.string().regex(/^[1-9]\d{0,18}$/).refine(v => /^[1-9]\d{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n);
const optionalId = id.nullable().optional().default(null);
const requiredText = max => z.string().trim().min(1).max(max);
const optionalText = max => z.preprocess(v => v === "" || typeof v === "string" && !v.trim() ? null : v,
  z.string().trim().min(1).max(max).nullable().optional().default(null));
const query = z.object({ buscar: z.string().trim().max(180).default(""),
  activo: z.enum(["true", "false"]).optional(), tipo: z.enum(["person", "sole", "company"]).optional(),
  categoriaId: id.optional(), marcaId: id.optional(), tipoInventarioId: id.optional(),
  orden: z.enum(["asc", "desc"]).default("asc"), pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(10) }).strict();
const state = z.object({ active: z.boolean() }).strict();
const brand = z.object({ name: requiredText(160), active: z.boolean().optional() }).strict();
const product = z.object({ code: requiredText(80), name: requiredText(255), description: optionalText(5000),
  categoryId: id, subcategoryId: optionalId, unitId: optionalId, brandId: optionalId, inventoryTypeId: optionalId,
  minimum: z.preprocess(v => v === "" || v === undefined ? null : v, z.union([z.string(), z.number().finite()])
    .transform(String).refine(v => /^\d{1,15}(\.\d{1,3})?$/.test(v)).nullable()),
  active: z.boolean().optional() }).strict();
const names = ["firstName", "lastName", "businessName", "socialName", "tradeName", "legalName"];
const supplier = z.object({ type: z.enum(["person", "sole", "company"]),
  firstName: optionalText(120), lastName: optionalText(120), businessName: optionalText(200), socialName: optionalText(250),
  tradeName: optionalText(200), legalName: optionalText(250),
  address: optionalText(2000), municipality: optionalText(160), country: optionalText(100),
  email: z.preprocess(v => v === "" ? null : v, z.string().trim().email().max(180).nullable().optional().default(null)),
  nit: optionalText(25).transform(v => v === null ? null : v.replace(/[-\s]/g, "").toUpperCase()),
  contactName: optionalText(200), phone: optionalText(40), postalCode: optionalText(20),
  paymentMethod: z.enum(["TRANSFERENCIA", "CHEQUE"]).nullable().optional().default(null),
  creditDays: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60)]).nullable().optional().default(null),
  chequeBeneficiary: optionalText(250),
  bankAccount: z.object({ bank: requiredText(160), name: requiredText(250), number: requiredText(80) }).strict().optional(),
  active: z.boolean().optional()
}).strict().superRefine((v, ctx) => {
  const applicable = v.type === "person" ? ["firstName", "lastName"] : v.type === "sole" ? ["businessName", "socialName"] : ["tradeName", "legalName"];
  for (const name of applicable.slice(0, v.type === "person" ? 2 : 1)) if (!v[name]) ctx.addIssue({ code: "custom", path: [name], message: "Campo obligatorio." });
  for (const name of names.filter(n => !applicable.includes(n))) if (v[name]) ctx.addIssue({ code: "custom", path: [name], message: "Campo no aplicable." });
  if (v.nit !== null && !v.nit) ctx.addIssue({ code: "custom", path: ["nit"], message: "NIT inválido." });
  if (v.bankAccount && v.paymentMethod !== "TRANSFERENCIA") ctx.addIssue({ code: "custom", path: ["bankAccount"], message: "Datos bancarios aplican a transferencia." });
  if (v.chequeBeneficiary && v.paymentMethod !== "CHEQUE") ctx.addIssue({ code: "custom", path: ["chequeBeneficiary"], message: "Beneficiario aplica a cheque." });
});
module.exports = { id, query, state, brand, product, supplier };
