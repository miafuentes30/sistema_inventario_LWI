const { loginSchema } = require("./auth.schema");
const { login } = require("./auth.service");

async function loginController(req, res, next) {
  try {
    const input = loginSchema.parse(req.body);
    const resultado = await login(input);

    return res.status(200).json({
      success: true,
      message: "Inicio de sesión exitoso.",
      data: resultado
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { loginController };
