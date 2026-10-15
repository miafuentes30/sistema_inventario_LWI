const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { app } = require('./src/app');
const { prisma } = require('./src/lib/prisma');
const { env } = require('./src/config/env');

test('Autenticación real y PostgreSQL', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function login(body, expected) {
    const response = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    assert.equal(response.status, expected);
    return response.json();
  }
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    await prisma.$queryRaw`SELECT 1`;
    for (const correo of ['admin@gmail.com', 'a@water.com', 'a@water.cc.evil.com', 'a@sub.water.cc']) {
      await login({correo, contrasena:'invalid-test-password'}, 400);
    }
    await login({}, 400);
    await login({correo:'',contrasena:''}, 400);
    await login({correo:`missing-${Date.now()}@water.cc`,contrasena:'invalid-test-password'}, 401);
    await login({correo:process.env.SEED_ADMIN_EMAIL,contrasena:'invalid-test-password'}, 401);
    assert.ok(process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD, 'Faltan credenciales locales');
    const result = await login({correo:process.env.SEED_ADMIN_EMAIL.toUpperCase(),contrasena:process.env.SEED_ADMIN_PASSWORD}, 200);
    const {token,usuario} = result.data;
    assert.equal(jwt.verify(token, env.JWT_SECRET).sub, usuario.id);
    assert.ok(usuario.nombre && usuario.rol.nombre);
    assert.equal(usuario.passwordHash, undefined);
    assert.equal(usuario.contrasena, undefined);
    console.log('Health, PostgreSQL, dominios, vacíos, inexistente, contraseña incorrecta, login y JWT: correctos');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
  }
});

