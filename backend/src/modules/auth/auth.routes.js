const express = require("express");
const rateLimit = require("express-rate-limit");
const { env } = require("../../config/env");
const { loginController } = require("./auth.controller");

const authRouter = express.Router();

const loginLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Demasiados intentos de inicio de sesión. Intenta nuevamente más tarde."
  }
});

authRouter.post("/login", loginLimiter, loginController);

module.exports = { authRouter };
