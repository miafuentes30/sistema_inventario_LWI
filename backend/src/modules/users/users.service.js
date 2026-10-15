const bcrypt = require("bcryptjs");
const { prisma } = require("../../lib/prisma");
const { AppError } = require("../../middleware/app-error");
const select = {
  id: true,
  nombre: true,
  correo: true,
  activo: true,
  ultimoAcceso: true,
  createdAt: true,
  rol: { select: { id: true, nombre: true } },
};
function serialize(user) {
  return {
    ...user,
    id: String(user.id),
    rol: { ...user.rol, id: String(user.rol.id) },
  };
}
async function getUser(id) {
  const user = await prisma.usuario.findUnique({
    where: { id: BigInt(id) },
    select,
  });
  if (!user) throw new AppError(404, "Usuario no encontrado.", "NOT_FOUND");
  return serialize(user);
}
async function list(query) {
  const where = {
    ...(query.buscar && {
      OR: [
        { nombre: { contains: query.buscar, mode: "insensitive" } },
        { correo: { contains: query.buscar, mode: "insensitive" } },
      ],
    }),
    ...(query.rolId && { rolId: BigInt(query.rolId) }),
    ...(query.activo && { activo: query.activo === "true" }),
  };
  const [users, total, registered, active, admins] = await prisma.$transaction([
    prisma.usuario.findMany({
      where,
      select,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.pagina - 1) * query.limite,
      take: query.limite,
    }),
    prisma.usuario.count({ where }),
    prisma.usuario.count(),
    prisma.usuario.count({ where: { activo: true } }),
    prisma.usuario.count({ where: { rol: { nombre: "Administrador" } } }),
  ]);
  return {
    usuarios: users.map(serialize),
    total,
    pagina: query.pagina,
    limite: query.limite,
    indicadores: {
      registrados: registered,
      activos: active,
      inactivos: registered - active,
      administradores: admins,
    },
  };
}
async function checkRole(tx, rolId) {
  if (!(await tx.rol.findFirst({ where: { id: BigInt(rolId), activo: true } })))
    throw new AppError(400, "Selecciona un rol activo.", "INVALID_ROLE");
}
async function create(input) {
  await checkRole(prisma, input.rolId);
  const passwordHash = await bcrypt.hash(input.contrasena, 12);
  return serialize(
    await prisma.usuario.create({
      data: {
        nombre: input.nombre,
        correo: input.correo,
        rolId: BigInt(input.rolId),
        activo: input.activo,
        passwordHash,
      },
      select,
    }),
  );
}
async function update(id, input, actor) {
  return prisma.$transaction(async (tx) => {
    // Serializa los cambios de cuentas para proteger al Último administrador.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(648215)`;
    const current = await tx.usuario.findUnique({
      where: { id: BigInt(id) },
      include: { rol: true },
    });
    if (!current)
      throw new AppError(404, "Usuario no encontrado.", "NOT_FOUND");
    const authorized = await tx.usuario.findUnique({
      where: { id: actor.id },
      include: { rol: true },
    });
    if (
      !authorized?.activo ||
      !authorized.rol.activo ||
      authorized.rol.nombre !== "Administrador"
    )
      throw new AppError(403, "No tienes permisos.", "FORBIDDEN");
    if (input.rolId) await checkRole(tx, input.rolId);
    const losesAdmin =
      input.activo === false ||
      (input.rolId && input.rolId !== String(current.rolId));
    if (current.id === actor.id && losesAdmin)
      throw new AppError(
        400,
        "No puedes desactivar tu cuenta ni cambiar tu propio rol.",
        "SELF_MODIFICATION",
      );
    if (
      current.activo &&
      current.rol.nombre === "Administrador" &&
      losesAdmin &&
      (await tx.usuario.count({
        where: { activo: true, rolId: current.rolId },
      })) <= 1
    )
      throw new AppError(
        409,
        "Debe existir al menos un administrador activo.",
        "LAST_ADMIN",
      );
    return serialize(
      await tx.usuario.update({
        where: { id: current.id },
        data: {
          ...input,
          ...(input.rolId && { rolId: BigInt(input.rolId) }),
          updatedAt: new Date(),
        },
        select,
      }),
    );
  });
}
module.exports = { select, serialize, getUser, list, create, update };
