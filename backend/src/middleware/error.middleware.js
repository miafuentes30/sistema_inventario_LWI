const { ZodError } = require("zod");
const { AppError } = require("./app-error");

function errorHandler(error, req, res, _next) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Datos de entrada inválidos.",
      code: "INVALID_INPUT",
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

  if (error.code === "P2002") {
    const model = error.meta?.modelName;
    const path = req.originalUrl.split("?")[0];
    const [message, code] = model === "Marca" || path.startsWith("/api/marcas")
      ? ["La marca ya está registrada.", "DUPLICATE_BRAND"]
      : model === "Producto" || path.startsWith("/api/productos")
        ? ["El código del producto ya está registrado.", "DUPLICATE_PRODUCT_CODE"]
        : path.startsWith("/api/proveedores")
          ? ["El proveedor o su NIT ya está registrado.", "DUPLICATE_SUPPLIER"]
          : model === "Usuario" || String(error.meta?.target).includes("correo")
            ? ["El correo ya está registrado.", "DUPLICATE_EMAIL"]
            : ["Ya existe un registro con estos datos.", "DUPLICATE_RECORD"];
    return res.status(409).json({ success: false, message, code });
  }
  if (error.code === "P2003") return res.status(400).json({ success: false, message: "La relación seleccionada no es válida.", code: "INVALID_CATALOG_REFERENCE" });
  if (error.code === "P2025") return res.status(404).json({ success: false, message: "Registro no encontrado.", code: "NOT_FOUND" });
  if (error.code === "P2034") return res.status(409).json({ success: false, message: "El registro cambió. Intenta nuevamente.", code: "CONFLICT" });
  if (error.code === "P2004") return res.status(400).json({ success: false, message: "Datos de entrada inválidos.", code: "INVALID_INPUT" });
  if (error.type === "entity.parse.failed")
    return res.status(400).json({ success: false, message: "JSON inválido." });
  // Never log request bodies, bank account values, credentials or Prisma query arguments.
  console.error({ name: error.name, code: error.code || "INTERNAL_ERROR", method: req.method, path: req.path });

  return res.status(500).json({
    success: false,
    message: "Ocurrió un error interno en el servidor.",
  });
}

module.exports = { errorHandler };
