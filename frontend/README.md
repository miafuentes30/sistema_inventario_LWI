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

## Revisión responsiva

Se reutilizan Home, SystemSearch, Modal, Catalog, CatalogForms, BrandsPanel y el layout de autenticación. Los ajustes se concentran en `src/styles/responsive.css`; no cambian API, autenticación, backend ni bases de datos.

Archivos de esta adaptación:

- `src/styles/responsive.css`: distribución, campos, tablas, modales y acceso móvil.
- `src/pages/Home.jsx`: foco, aislamiento y accesibilidad del menú; regiones de tablas.
- `src/components/AccountUI.jsx`: modal compartido, identificador accesible único y bloqueo del fondo.
- `src/components/CatalogForms.jsx`: asociación entre errores y campos.
- `src/pages/Catalog.jsx`, `src/pages/Users.jsx`, `src/components/BrandsPanel.jsx`: tablas navegables con teclado.
- `src/pages/Login.jsx`: asociación de mensajes de error con las entradas existentes.
- `responsive.test.mjs`, `package.json`: comprobaciones automatizadas sin base de datos.
- `README.md` y `.gitignore` de la raíz: instrucciones y exclusión de artefactos locales.

El sidebar pasa a panel superpuesto hasta 820 px. Hasta 600 px los formularios de catálogo usan una columna y el panel decorativo de acceso se reduce. Se mantienen las consultas de contenedor existentes para tarjetas, filtros y paneles: responden al espacio real disponible, incluso con el sidebar contraído. Las tablas conservan sus columnas dentro de regiones desplazables accesibles con teclado. Los modales usan altura dinámica, desplazamiento interno y acciones adheridas al borde inferior.

### Pruebas sin base de datos

Desde `frontend`:

```powershell
npm run test:sprint4
npm run build
npm run test:responsive
```

La última orden necesita Playwright y Microsoft Edge. No se añadió una dependencia al proyecto: se reutilizó Playwright disponible en el entorno. Si no se resuelve como módulo local, indicar su carpeta mediante `LWI_PLAYWRIGHT_PATH`. En el entorno utilizado:

```powershell
$env:LWI_PLAYWRIGHT_PATH = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
npm run test:responsive
```

El navegador de prueba intercepta todas las peticiones `/api/`; usa datos identificables exclusivamente dentro del arnés y no necesita servidor backend. No ejecutar las suites de integración que escriben en PostgreSQL para revisar estos cambios visuales.

La matriz prueba 320, 375, 430, 768, 1024, 1366, 1920 y 2560 px en español, inglés y francés. Recorre Login, recuperación, Inicio, Inventario, Detalle de producto, Proveedores, Usuarios, Configuración y Mi Perfil; también formularios de proveedores por tipo, información bancaria, marcas, validaciones y errores. Comprueba límites del viewport, teclado, Escape, recuperación del foco, bloqueo del fondo, sidebar contraído, movimiento reducido y modales a 320 × 568.

Las capturas y el reporte JSON se guardan en `.responsive-artifacts/`, ignorado por Git. La prueba de reajuste equivalente al 200 % reduce el viewport CSS a 683 y 512 px: no representa una comprobación manual del zoom real ni del teclado virtual de un teléfono. Queda pendiente revisar Safari/iOS, Android y ayudas técnicas con dispositivos reales. No constituye una auditoría completa WCAG.

Resultado de esta entrega: 413 comprobaciones de distribución aprobadas en Edge headless, 3 pruebas existentes de interfaz aprobadas y compilación de producción exitosa. Se revisaron capturas representativas de escritorio, tablet y móvil. Las suites que escriben en PostgreSQL no se ejecutaron.

Corrección posterior de escala vertical: el panel gráfico y el formulario de acceso consideran también el alto disponible. La regresión adicional comprueba 1366 × 600, 1525 × 695, 1920 × 875 y 1024 × 600 en los tres idiomas, exige que el Login y su pie quepan completos y recorre las demás pantallas. La ejecución focalizada terminó con 135 comprobaciones aprobadas y build exitoso; capturas `login-height-*.png` en la carpeta de artefactos.

Para una comprobación breve opcional:

```powershell
$env:LWI_RESPONSIVE_WIDTHS = '320,1366'
$env:LWI_RESPONSIVE_LANGUAGES = 'fr'
npm run test:responsive
Remove-Item Env:LWI_RESPONSIVE_WIDTHS, Env:LWI_RESPONSIVE_LANGUAGES
```

Para revisar la aplicación existente usar `npm run dev:sprint5` y abrir `http://localhost:5174`; si ese servidor ya está abierto, basta recargar. No se modifica la configuración de conexión existente.

## Assets institucionales

- `login-living-water.png`: panel institucional usado en el login.
- `living-water-logo.png`: logo extraído de la composición aprobada para reutilizarlo.
- `login-reference.png`: referencia visual completa del prototipo.
