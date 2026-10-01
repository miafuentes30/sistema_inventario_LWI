require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const roles = [
  ["Administrador", "Administrador general del sistema"],
  ["Solicitante", "Usuario que realiza solicitudes de inventario"],
  ["Compras", "Usuario encargado de procesos de compras"],
  ["Finanzas", "Usuario del área financiera"]
];

async function main() {
  for (const [nombre, descripcion] of roles) {
    await prisma.rol.upsert({
      where: { nombre },
      update: { descripcion, activo: true },
      create: { nombre, descripcion, activo: true }
    });
  }

  const rolAdministrador = await prisma.rol.findUniqueOrThrow({
    where: { nombre: "Administrador" }
  });

  const nombre = process.env.SEED_ADMIN_NAME?.trim() || "Administrador LWI";
  const correo = (process.env.SEED_ADMIN_EMAIL || "admin@lwi.local")
    .trim()
    .toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "Cambiar123*";
  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);

  if (!Number.isInteger(rounds) || rounds < 10 || rounds > 15) {
    throw new Error("BCRYPT_ROUNDS debe ser un entero entre 10 y 15.");
  }

  const passwordHash = await bcrypt.hash(password, rounds);
  const now = new Date();

  const usuario = await prisma.usuario.upsert({
    where: { correo },
    update: {
      nombre,
      passwordHash,
      rolId: rolAdministrador.id,
      activo: true,
      updatedAt: now
    },
    create: {
      nombre,
      correo,
      passwordHash,
      rolId: rolAdministrador.id,
      activo: true,
      createdAt: now,
      updatedAt: now
    },
    select: {
      id: true,
      nombre: true,
      correo: true
    }
  });

  console.log("Seed completado.");
  console.log(`Usuario de prueba: ${usuario.correo}`);
  console.log("La contraseña es la configurada en SEED_ADMIN_PASSWORD del archivo .env.");
}

main()
  .catch((error) => {
    console.error("Error ejecutando seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
