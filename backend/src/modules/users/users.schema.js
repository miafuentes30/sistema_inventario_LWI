const { z } = require("zod");
const id = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine(
    (value) =>
      /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n,
  );
const nombre = z.string().trim().min(2).max(120);
const correo = z
  .string()
  .trim()
  .email()
  .max(180)
  .refine(
    (value) => value.toLowerCase().endsWith("@water.cc"),
    "Utiliza tu correo institucional @water.cc.",
  )
  .transform((value) => value.toLowerCase());
const password = z
  .string()
  .min(12)
  .max(72)
  .refine(
    (value) =>
      Buffer.byteLength(value, "utf8") <= 72 &&
      /[a-z]/.test(value) &&
      /[A-Z]/.test(value) &&
      /[0-9]/.test(value) &&
      /[^a-zA-Z0-9]/.test(value),
    "Usa 12 a 72 bytes, mayúsculas, minúsculas, números y símbolos.",
  );
const fields = { nombre, correo, rolId: id, activo: z.boolean() };
const create = z
  .object({
    ...fields,
    activo: z.boolean().default(true),
    contrasena: password,
    confirmacion: z.string(),
  })
  .strict()
  .refine((data) => data.contrasena === data.confirmacion, {
    path: ["confirmacion"],
    message: "Las contraseñas no coinciden.",
  });
const update = z
  .object(fields)
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0);
const query = z
  .object({
    buscar: z.string().trim().max(180).default(""),
    rolId: id.optional(),
    activo: z.enum(["true", "false"]).optional(),
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
    limite: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();
const changePassword = z
  .object({
    actual: z.string().min(1).max(255),
    nueva: password,
    confirmacion: z.string(),
  })
  .strict()
  .refine((data) => data.nueva === data.confirmacion, {
    path: ["confirmacion"],
    message: "Las contraseñas no coinciden.",
  });
module.exports = { id, nombre, create, update, query, changePassword };
