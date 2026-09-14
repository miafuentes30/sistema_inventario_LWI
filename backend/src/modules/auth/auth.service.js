const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { env } = require("../../config/env");
const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../middleware/app-error");

const CREDENCIALES_INVALIDAS = "Correo o contraseña incorrectos.";

async function login(input) {
  const usuario = await prisma.usuario.findUnique({
    where: { correo: input.correo },
    include: { rol: true }
  });

  if (!usuario || !usuario.activo || !usuario.rol.activo) {
    throw new AppError(401, CREDENCIALES_INVALIDAS, "INVALID_CREDENTIALS");
  }

  const passwordValido = await bcrypt.compare(
    input.contrasena,
    usuario.passwordHash
  );

  if (!passwordValido) {
    throw new AppError(401, CREDENCIALES_INVALIDAS, "INVALID_CREDENTIALS");
  }

  const now = new Date();

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: {
      ultimoAcceso: now,
      updatedAt: now
    }
  });

  const token = jwt.sign(
    {
      sub: usuario.id.toString(),
      correo: usuario.correo,
      rol: usuario.rol.nombre
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

  return {
    token,
    expiresIn: env.JWT_EXPIRES_IN,
    usuario: {
      id: usuario.id.toString(),
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: {
        id: usuario.rol.id.toString(),
        nombre: usuario.rol.nombre
      }
    }
  };
}

module.exports = { login };
