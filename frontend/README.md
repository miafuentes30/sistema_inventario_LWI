# Frontend - Sistema de Inventario LWI

Frontend desarrollado con **React + Vite + JavaScript** para el Sistema de Inventario de Living Water Guatemala.

## Incluye

- Login basado en el prototipo aprobado.
- Imagen institucional y logo incluidos en `src/assets/images`.
- Mostrar/ocultar contraseña.
- Opción "Recordarme".
- Integración real con `POST /api/auth/login`.
- Persistencia de sesión con `localStorage` o `sessionStorage`.
- Ruta protegida.
- Cierre de sesión.
- Pantalla inicial de recuperación de contraseña.
- Home provisional para comprobar que el login y el JWT funcionan.

## Ejecutar

### 1. Backend

Desde la raíz del proyecto:

```bash
cd backend
npm install
```

Configura tu `.env` según `backend/.env.example` y asegúrate de que:

```env
FRONTEND_URL=http://localhost:5173
```

Luego:

```bash
npm run dev
```

El backend debe quedar disponible en el puerto configurado (por defecto, normalmente `3000`).

### 2. Frontend

En otra terminal:

```bash
cd frontend
npm install
npm run dev
```

Abre:

```text
http://localhost:5173
```

## API

El frontend utiliza:

```env
VITE_API_URL=http://localhost:3000/api
```

Si tu backend utiliza otro puerto, modifica `frontend/.env`.

## Assets

- `login-living-water.png`: panel institucional usado en el login.
- `living-water-logo.png`: logo extraído de la composición aprobada para reutilizarlo.
- `login-reference.png`: referencia visual completa del prototipo.
