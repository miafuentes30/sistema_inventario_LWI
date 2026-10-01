const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { env } = require("./config/env");
const { errorHandler } = require("./middleware/error.middleware");
const { authRouter } = require("./modules/auth/auth.routes");

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true
  })
);
app.use(express.json({ limit: "10kb" }));

app.get("/api/health", (_req, res) => {
  return res.status(200).json({
    success: true,
    message: "Backend del Sistema de Inventario funcionando correctamente."
  });
});

app.use("/api/auth", authRouter);

app.use((_req, res) => {
  return res.status(404).json({
    success: false,
    message: "Ruta no encontrada."
  });
});

app.use(errorHandler);

module.exports = { app };
