# Backend - Sistema de Inventario LWI

Backend del módulo de **login** desarrollado en **Node.js + Express usando JavaScript**.

## Tecnologías

- Node.js
- JavaScript
- Express
- PostgreSQL
- Prisma ORM
- bcryptjs
- JSON Web Token (JWT)
- Zod
- Helmet, CORS y rate limiting

## Requisitos

- Node.js 20 o superior
- PostgreSQL en `localhost:5432`
- Base de datos `sistema_inventario`
- Tablas `rol` y `usuarios` en el schema `public`

El proyecto respeta la columna `contraseña` existente en PostgreSQL. Prisma la mapea internamente como `passwordHash`.

## 1. Instalar dependencias

```bash
npm install
```

## 2. Crear `.env`

En PowerShell:

```powershell
Copy-Item .env.example .env
```

Luego modifica como mínimo:

```env
DATABASE_URL="postgresql://postgres:TU_PASSWORD@localhost:5432/sistema_inventario?schema=public"
JWT_SECRET="UNA_CLAVE_MUY_LARGA_Y_SEGURA_DE_AL_MENOS_32_CARACTERES"
```

## 3. Generar Prisma Client

```bash
npm run prisma:generate
```

Como las tablas ya existen en DBeaver, no necesitas ejecutar migraciones para este módulo.

## 4. Crear usuario administrador de prueba

Revisa en `.env`:

```env
SEED_ADMIN_NAME="Administrador"
SEED_ADMIN_EMAIL="admin@lwater.local"
SEED_ADMIN_PASSWORD="Password23*"
```

Luego:

```bash
npm run seed
```

## 5. Ejecutar

Modo desarrollo:

```bash
npm run dev
```

O ejecución normal:

```bash
npm start
```

Servidor:

```text
http://localhost:3000
```

## 6. Probar health check

```text
GET http://localhost:3000/api/health
```

## 7. Probar login

```text
POST http://localhost:3000/api/auth/login
```

Body JSON:

```json
{
  "correo": "admin@lwater.local",
  "contrasena": "Password123*"
}
```

## Estructura

```text
backend/
├── database/
│   └── schema.sql
├── prisma/
│   ├── schema.prisma
│   └── seed.js
├── src/
│   ├── config/
│   │   └── env.js
│   ├── lib/
│   │   └── prisma.js
│   ├── middleware/
│   │   ├── app-error.js
│   │   └── error.middleware.js
│   ├── modules/
│   │   └── auth/
│   │       ├── auth.controller.js
│   │       ├── auth.routes.js
│   │       ├── auth.schema.js
│   │       └── auth.service.js
│   ├── app.js
│   └── server.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Comandos

```bash
npm run dev
npm start
npm run seed
npm run prisma:generate
npm run prisma:pull
npm run prisma:studio
```

## Importante

- No subas `.env` a GitHub.
- Las contraseñas se guardan con hash bcrypt, no en texto plano.
- Cambia `JWT_SECRET` antes de usar el sistema fuera de desarrollo.
- Este backend cubre únicamente el login. No incluye registro, recuperación de contraseña ni administración de permisos.
