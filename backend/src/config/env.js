require("dotenv").config();
const { z } = require("zod");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida."),
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres."),
  JWT_EXPIRES_IN: z.string().default("8h"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variables de entorno inválidas:", parsed.error.flatten().fieldErrors);
  throw new Error("No se pudo iniciar el backend por configuración inválida.");
}

module.exports = { env: parsed.data };
