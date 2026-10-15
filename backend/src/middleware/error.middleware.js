const { ZodError } = require("zod");
const { AppError } = require("./app-error");

function errorHandler(error, _req, res, _next) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Datos de entrada inválidos.",
      errors: error.flatten().fieldErrors,
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }

  if (error.code === "P2002")
    return res.status(409).json({
      success: false,
      message: "El correo ya está registrado.",
      code: "DUPLICATE_EMAIL",
    });
  if (error.type === "entity.parse.failed")
    return res.status(400).json({ success: false, message: "JSON inválido." });
  console.error(error);

  return res.status(500).json({
    success: false,
    message: "Ocurrió un error interno en el servidor.",
  });
}

module.exports = { errorHandler };
