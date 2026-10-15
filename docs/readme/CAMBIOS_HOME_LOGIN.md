# Home y login institucional (@water.cc)

- Login frontend y validación de dominio en backend: solo correos `@water.cc` (no crea cuentas automáticamente).
- Contraseña verificada contra hash bcrypt almacenado en PostgreSQL; JWT emitido por el backend.
- Home con identidad Living Water, datos reales del usuario autenticado, navegación preliminar y cierre de sesión.
- Las métricas se muestran como `—` hasta disponer de endpoints reales; no son datos inventados.
- Los demás módulos son pantallas de próxima fase, no CRUD operativo.
- Recuperación de contraseña sigue sin endpoint de envío de correo.

## Ejecutar localmente

1. PostgreSQL debe estar disponible y la base de datos creada.
2. En `backend/`, copiar `.env.example` a `.env` y configurar `DATABASE_URL`, `JWT_SECRET` aleatorio, `FRONTEND_URL` y un `SEED_ADMIN_EMAIL` **real** `@water.cc`. Establecer una contraseña segura en `SEED_ADMIN_PASSWORD`.
3. Ejecutar `npm ci`, `npx prisma generate` y, si la base es nueva, aplicar el esquema SQL o migraciones aprobadas antes de `npm run seed`.
4. Ejecutar `npm run seed` solo en entorno de desarrollo y `npm run dev`. **El seed actualiza la contraseña del usuario indicado**.
5. En `frontend/`, copiar `.env.example` a `.env`, comprobar `VITE_API_URL=http://localhost:3000/api`, ejecutar `npm ci` y `npm run dev`.
6. En DevTools > Network verificar `POST /api/auth/login` con un usuario que ya exista en PostgreSQL.

> No se ha probado una conexión real con PostgreSQL porque no se proporcionó un servidor ni credenciales. La validación `@water.cc` limita el formato, no demuestra por sí sola la titularidad del correo. Para producción se recomienda verificar sesiones con el backend y considerar cookies HttpOnly.
