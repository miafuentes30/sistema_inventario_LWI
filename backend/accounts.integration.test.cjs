const { test, mock } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const jwt = require("jsonwebtoken");
const { app } = require("./src/app");
const { prisma } = require("./src/lib/prisma");
const { env } = require("./src/config/env");
const { credentialVersion } = require("./src/middleware/auth.middleware");

test("Usuarios, perfil y configuración con PostgreSQL real", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const marker = `test-${randomUUID()}`;
  const email = `${marker}@water.cc`;
  const password = `Aa9!${randomUUID()}`;
  const newPassword = `Bb8!${randomUUID()}`;
  let createdId;
  let token;
  let userToken;
  let role;
  async function request(
    path,
    method = "GET",
    body,
    auth = token,
    expected = 200,
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    assert.equal(
      response.status,
      expected,
      `${method} ${path}: ${data.message || "estado inesperado"}`,
    );
    return data.data;
  }
  try {
    await t.test("JWT requerido y token inválido rechazado", async () => {
      await request("/usuarios", "GET", undefined, null, 401);
      await request("/usuarios", "GET", undefined, "bad-token", 401);
    });
    await t.test("login administrador existente", async () => {
      const data = await request(
        "/auth/login",
        "POST",
        {
          correo: process.env.SEED_ADMIN_EMAIL,
          contrasena: process.env.SEED_ADMIN_PASSWORD,
        },
        null,
      );
      token = data.token;
    });
    await t.test("roles reales, indicadores y paginación", async () => {
      const roles = await request("/usuarios/roles");
      role = roles.find((r) => r.nombre !== "Administrador");
      assert.ok(role);
      const data = await request("/usuarios?pagina=1&limite=1");
      assert.ok(data.total >= 1);
      assert.equal(data.usuarios.length, 1);
      assert.ok(data.indicadores.registrados >= 1);
      assert.equal(data.usuarios[0].passwordHash, undefined);
    });
    await t.test("validaciones de alta", async () => {
      for (const overrides of [
        { correo: "bad@gmail.com" },
        { contrasena: "weak", confirmacion: "weak" },
        { confirmacion: "mismatch" },
        { rolId: "999999999999" },
        { rolId: "9223372036854775808" },
      ]) {
        await request(
          "/usuarios",
          "POST",
          {
            nombre: "Usuario de prueba",
            correo: email,
            rolId: role.id,
            activo: true,
            contrasena: password,
            confirmacion: password,
            ...overrides,
          },
          token,
          400,
        );
      }
    });
    await t.test("crear usuario y rechazar duplicado", async () => {
      const input = {
        nombre: "Usuario de prueba",
        correo: email,
        rolId: role.id,
        activo: true,
        contrasena: password,
        confirmacion: password,
      };
      const user = await request("/usuarios", "POST", input, token, 201);
      createdId = user.id;
      assert.equal(user.passwordHash, undefined);
      await request("/usuarios", "POST", input, token, 409);
    });
    await t.test("ver, buscar y filtrar usuario", async () => {
      const user = await request(`/usuarios/${createdId}`);
      assert.equal(user.correo, email);
      const data = await request(
        `/usuarios?buscar=${marker}&rolId=${role.id}&activo=true`,
      );
      assert.equal(data.total, 1);
      await request("/usuarios?pagina=-1", "GET", undefined, token, 400);
      await request("/usuarios/invalid", "GET", undefined, token, 400);
    });
    await t.test("editar usuario y activar/desactivar", async () => {
      await request(`/usuarios/${createdId}`, "PATCH", {
        nombre: "Nombre actualizado",
      });
      await request(`/usuarios/${createdId}/estado`, "PATCH", {
        activo: false,
      });
      await request(
        "/auth/login",
        "POST",
        { correo: email, contrasena: password },
        null,
        401,
      );
      await request(`/usuarios/${createdId}/estado`, "PATCH", { activo: true });
    });
    await t.test("permisos del rol no administrador", async () => {
      userToken = (
        await request(
          "/auth/login",
          "POST",
          { correo: email, contrasena: password },
          null,
        )
      ).token;
      for (const path of ["/usuarios", "/usuarios/roles", "/configuracion"])
        await request(path, "GET", undefined, userToken, 403);
      await request(
        `/usuarios/${createdId}`,
        "PATCH",
        { rolId: role.id },
        userToken,
        403,
      );
      await request("/usuarios", "POST", {}, userToken, 403);
    });
    await t.test("perfil real y edición limitada al nombre", async () => {
      const user = await request("/perfil", "GET", undefined, userToken);
      assert.equal(user.correo, email);
      assert.equal(user.passwordHash, undefined);
      await request("/perfil", "PATCH", { rolId: role.id }, userToken, 400);
      await request(
        "/perfil",
        "PATCH",
        { correo: "other@water.cc" },
        userToken,
        400,
      );
      const edited = await request(
        "/perfil",
        "PATCH",
        { nombre: "Perfil actualizado" },
        userToken,
      );
      assert.equal(edited.nombre, "Perfil actualizado");
    });
    await t.test(
      "rechazo de contraseña actual incorrecta y cambio seguro",
      async () => {
        await request(
          "/perfil/contrasena",
          "POST",
          {
            actual: "wrong-password",
            nueva: newPassword,
            confirmacion: newPassword,
          },
          userToken,
          400,
        );
        await request(
          "/perfil/contrasena",
          "POST",
          { actual: password, nueva: newPassword, confirmacion: newPassword },
          userToken,
        );
        await request("/perfil", "GET", undefined, userToken, 401);
        await request(
          "/auth/login",
          "POST",
          { correo: email, contrasena: password },
          null,
          401,
        );
        userToken = (
          await request(
            "/auth/login",
            "POST",
            { correo: email, contrasena: newPassword },
            null,
          )
        ).token;
        await request("/perfil", "GET", undefined, userToken);
      },
    );
    await t.test("desactivación invalida JWT existente", async () => {
      await request(`/usuarios/${createdId}/estado`, "PATCH", {
        activo: false,
      });
      await request("/perfil", "GET", undefined, userToken, 401);
    });
    await t.test(
      "autoprotección administrador y configuración sin secretos",
      async () => {
        const admin = await request("/perfil");
        await request(
          `/usuarios/${admin.id}/estado`,
          "PATCH",
          { activo: false },
          token,
          400,
        );
        await request(
          `/usuarios/${admin.id}`,
          "PATCH",
          { rolId: role.id },
          token,
          400,
        );
        const settings = await request("/configuracion");
        assert.equal(settings.dominio, "@water.cc");
        assert.equal(settings.JWT_SECRET, undefined);
        assert.equal(settings.DATABASE_URL, undefined);
      },
    );
    await t.test(
      "rol real prevalece sobre un claim JWT manipulado",
      async () => {
        const u = await prisma.usuario.findUnique({
          where: { id: BigInt(createdId) },
        });
        const fake = jwt.sign(
          {
            sub: String(u.id),
            rol: "Administrador",
            cv: credentialVersion(u.passwordHash),
          },
          env.JWT_SECRET,
          { expiresIn: "1m" },
        );
        await request("/usuarios", "GET", undefined, fake, 401);
        await request(`/usuarios/${createdId}/estado`, "PATCH", {
          activo: true,
        });
        await request("/usuarios", "GET", undefined, fake, 403);
      },
    );
  } finally {
    // Elimina exclusivamente la cuenta desechable creada por esta prueba.
    if (createdId)
      await prisma.usuario.deleteMany({
        where: { id: BigInt(createdId), correo: email },
      });
    await new Promise((r) => server.close(r));
    await prisma.$disconnect();
  }
});

test("Protección del último administrador, sin modificar registros", async () => {
  const service = require("./src/modules/users/users.service");
  const current = {
    id: 1n,
    activo: true,
    rolId: 1n,
    rol: { nombre: "Administrador" },
  };
  const tx = {
    $executeRaw: async () => {},
    usuario: {
      findUnique: async ({ where }) =>
        where.id === 1n
          ? current
          : {
              id: 2n,
              activo: true,
              rol: { activo: true, nombre: "Administrador" },
            },
      count: async () => 1,
    },
  };
  const original = prisma.$transaction;
  prisma.$transaction = async (fn) => fn(tx);
  try {
    await assert.rejects(
      service.update("1", { activo: false }, { id: 2n }),
      (error) => error.code === "LAST_ADMIN",
    );
  } finally {
    prisma.$transaction = original;
  }
});
