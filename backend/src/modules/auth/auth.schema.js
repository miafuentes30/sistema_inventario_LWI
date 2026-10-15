const { z } = require("zod");

const loginSchema = z.object({
  correo: z
    .string()
    .trim()
    .email("El correo electrónico no es válido.")
    .refine((value) => value.toLowerCase().endsWith("@water.cc"), "Utiliza tu correo institucional @water.cc.")
    .max(180)
    .transform((value) => value.toLowerCase()),
  contrasena: z
    .string()
    .min(1, "La contraseña es requerida.")
    .max(255, "La contraseña es demasiado larga.")
});

module.exports = { loginSchema };
