const { z } = require("zod");

const correoInstitucional = z
  .string()
  .trim()
  .toLowerCase()
  .email("Ingresa un correo electrónico válido.")
  .refine(
    (correo) => correo.endsWith("@water.cc"),
    "Debes utilizar un correo institucional @water.cc."
  );

const loginSchema = z.object({
  correo: correoInstitucional,
  contrasena: z
    .string()
    .min(1, "La contraseña es obligatoria."),
});

module.exports = {
  loginSchema,
};