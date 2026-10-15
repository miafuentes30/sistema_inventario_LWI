# Usuarios, Configuración y Perfil

Implementación sobre React/Vite/JavaScript y Express/Prisma/PostgreSQL. Se conservan el Dashboard, las imágenes, el login, la recuperación de contraseña y las tablas existentes. No requiere migraciones ni ejecutar el seed.

## Funcionalidades

- `/usuarios`: indicadores reales, búsqueda, filtros por rol/estado, paginación, consulta, creación, edición y activación/desactivación con confirmación. Solo Administrador.
- `/configuracion`: información institucional y zona horaria, idioma Español/English mediante LanguageContext y persistencia en el navegador, información de seguridad. Solo Administrador.
- `/perfil`: información real de la cuenta, edición del nombre y cambio de contraseña. Disponible para cualquier cuenta autenticada.
- Menú del perfil: datos reales, enlaces a perfil/configuración, cierre con Escape o clic fuera y logout.
- Se reutiliza el layout institucional de Home en las nuevas rutas. Los estilos nuevos están aislados en `frontend/src/styles/accounts.css`.

Las referencias gráficas orientan el diseño. No se copiaron usuarios, correos, bodegas, categorías, teléfonos ni estadísticas de ejemplo de las imágenes.

## Endpoints

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/usuarios` | Administrador |
| GET | `/api/usuarios/roles` | Administrador |
| GET | `/api/usuarios/:id` | Administrador |
| POST | `/api/usuarios` | Administrador |
| PATCH | `/api/usuarios/:id` | Administrador |
| PATCH | `/api/usuarios/:id/estado` | Administrador |
| GET | `/api/perfil` | Cuenta autenticada |
| PATCH | `/api/perfil` | Cuenta autenticada; solo nombre |
| POST | `/api/perfil/contrasena` | Cuenta autenticada |
| GET | `/api/configuracion` | Administrador |

Las peticiones autenticadas usan `Authorization: Bearer <token>`. Se conserva el contrato `{ success, data }` y los errores con `message`, `code` cuando corresponde y errores Zod por campo.

`GET /api/usuarios` acepta `buscar`, `rolId`, `activo=true|false`, `pagina` (desde 1) y `limite` (1–50). Retorna usuarios sin hashes, total filtrado, página, límite e indicadores generales.

Crear usuario: `nombre`, `correo`, `rolId` (ID real en texto), `activo`, `contrasena`, `confirmacion`. Editar: cualquiera de nombre/correo/rolId/activo. Estado: `{ activo: boolean }`. Cambio de contraseña: `actual`, `nueva`, `confirmacion`.

## Seguridad

- JWT HS256 verificado en el servidor; cuenta y rol activos consultados en PostgreSQL en cada petición. Los permisos usan el rol de la base, no el claim visual del token.
- Validación Zod estricta y parametrización Prisma; IDs limitados al rango BigInt de PostgreSQL.
- Correo normalizado y dominio completo `@water.cc`. Duplicados devuelven 409.
- Contraseñas de al menos 12 caracteres, máximo 72 bytes UTF-8, mayúsculas, minúsculas, números y símbolos; bcrypt con 12 rondas para nuevas contraseñas.
- Edición del perfil limitada al nombre. La contraseña requiere comprobar la actual, confirmación y una contraseña diferente. El endpoint limita los intentos.
- La versión de credenciales del JWT se deriva del hash de contraseña mediante SHA-256. Cambiar la contraseña invalida todos los JWT anteriores al siguiente uso. El cliente cierra la sesión y muestra confirmación en el login.
- **Las sesiones creadas antes de esta actualización deben iniciar sesión nuevamente**, porque no incluyen la versión de credenciales.
- No se permite desactivar la cuenta propia ni cambiar el propio rol. Las modificaciones administrativas usan transacción y bloqueo PostgreSQL para proteger al último administrador activo.
- Sin eliminación de usuarios en la interfaz ni exposición de hashes, secretos o contraseñas. Las pruebas limpian únicamente la cuenta desechable que ellas mismas crean.

## Archivos

Creados:

- `backend/src/middleware/auth.middleware.js`
- `backend/src/modules/users/users.schema.js`, `users.service.js`, `users.routes.js`
- `backend/src/modules/profile/profile.routes.js`
- `backend/src/modules/settings/settings.routes.js`
- `backend/accounts.integration.test.cjs`
- `frontend/src/pages/Users.jsx`, `Profile.jsx`, `Settings.jsx`
- `frontend/src/components/AccountUI.jsx`
- `frontend/src/services/api.js`
- `frontend/src/styles/accounts.css`
- `frontend/account-ui.test.mjs`
- Este documento.

Modificados: `backend/package.json`, `backend/src/app.js`, `backend/src/modules/auth/auth.service.js`, `backend/src/middleware/error.middleware.js`; `frontend/package.json`, su lockfile, `frontend/src/App.jsx`, `main.jsx`, `context/AuthContext.jsx`, `pages/Home.jsx`, `pages/Login.jsx` y `routes/ProtectedRoute.jsx`.

## Ejecución y pruebas

Iniciar Docker Desktop y el contenedor existente si está detenido:

```powershell
docker start postgres-lwi
```

En una terminal:

```powershell
cd backend
npm ci
npm run dev
```

En otra:

```powershell
cd frontend
npm ci
npm run dev
```

Abrir `http://localhost:5173/login`. Se conservan los archivos `.env` locales. No se cambió la contraseña del administrador.

Pruebas desde cada carpeta:

```powershell
# backend
npm test

# frontend
npm test
npm run build
```

Las pruebas requieren PostgreSQL y las credenciales locales existentes `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` de `backend/.env`. Inician sus propios servidores HTTP temporales. No necesitan otro backend corriendo. La prueba frontend usa jsdom como dependencia de desarrollo y no añade dependencias al bundle de producción.

Resultados comprobados: 16 pruebas backend correctas y una integración frontend DOM que recorre protección de ruta, login real, retorno a Usuarios, alta desde modal, perfil, Escape, clic fuera, cambio y persistencia de idioma, restauración de sesión, logout, Recordarme desactivado, permisos de un rol no administrador y cambio de contraseña desde el formulario.

La prueba DOM usa peticiones HTTP y PostgreSQL reales; no simula respuestas de la API. El comportamiento nativo de apertura/cierre de dialog se adapta para jsdom. No sustituye una prueba visual en un navegador real.

## Pendientes explícitos

- Stock mínimo, alertas de inventario, notificaciones de existencias bajas, categorías, unidades, bodegas, apariencia, respaldos e integraciones: “Disponible próximamente”, sin controles de guardado ficticios.
- La tabla de usuarios no muestra ni filtra bodegas: no existe esa relación en el esquema actual. Se requiere definir ese módulo antes de asignarlas.
- Revisión visual final en navegador real y dispositivos. No se afirma fidelidad exacta a Figma ni verificación visual de los breakpoints.
