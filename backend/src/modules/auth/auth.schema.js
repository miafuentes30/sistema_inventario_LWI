const { z } = require("zod");

const loginSchema = z.object({
  correo: z
    .string()
    .trim()
    .email("El correo electrónico no es válido.")
    .max(180)
    .transform((value) => value.toLowerCase()),
  contrasena: z
    .string()
    .min(1, "La contraseña es requerida.")
    .max(255, "La contraseña es demasiado larga.")
});

module.exports = { loginSchema };
