# Dashboard Living Water Guatemala

Se actualizó el Home para reproducir la estructura del diseño de referencia: sidebar institucional, barra superior, banner, cuatro indicadores, movimientos recientes, stock por categoría, stock bajo y seis accesos rápidos. Se conservaron login, JWT, contexto de autenticación, backend Express, Prisma y PostgreSQL del ZIP anterior.

**Importante:** Los indicadores y tablas muestran `—` o mensajes de estado vacío porque el backend actual no incluye APIs de inventario. No se incorporaron cifras ficticias del mockup. Las secciones del menú son placeholders hasta que se implementen sus módulos.

## Ejecución

1. Mantener PostgreSQL funcionando y `backend/.env` configurado localmente (no subir credenciales).
2. `cd backend && npm install && npx prisma generate && npm run dev`
3. En otra terminal: `cd frontend && npm install && npm run dev`
4. Abrir `http://localhost:5173` e iniciar sesión con un usuario creado mediante el seed.

## Archivos principales cambiados
- `frontend/src/pages/Home.jsx`
- `frontend/src/styles/global.css` (nuevas reglas `lw-*` al final)
- `frontend/src/assets/images/dashboard-landscape.svg` (ilustración local del paisaje, no fotografía original del prototipo)

El diseño está preparado para sustituir los placeholders por datos reales al implementar las API de inventario. No se modifica la lógica del backend.
