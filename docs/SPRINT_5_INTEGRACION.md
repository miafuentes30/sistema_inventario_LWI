# Sprint 5: integración sobre PostgreSQL aislado

Revisión de cierre: 12 de noviembre de 2026. Alcance preparado para demostración en `sistema_inventario_sprint5_test`; la puesta en producción requiere autorización independiente. Esta revisión no ejecutó migraciones, `db push`, borrados de datos ni cambios de Docker o credenciales.

## Alcance y protección de la base principal

Se integraron los modelos validados en `backend/prisma/schema.prisma`, conservando los campos existentes de Rol y Usuario. No se generaron ni aplicaron nuevas migraciones en esta etapa. Los SQL de la propuesta se conservan.

El perfil Sprint 5 solo admite `sistema_inventario_sprint5_test`: verifica tanto la URL como `current_database()` antes de habilitar los módulos. En el perfil habitual, las rutas nuevas responden 503 y las rutas de autenticación, usuarios y perfil continúan disponibles. No se cambió el `.env` principal. La auditoría de solo lectura comparó tablas, columnas, restricciones, índices, secuencias, huellas de registros y `.env`: sin cambios; 4 roles y 1 usuario en la principal.

## Funcionalidades

- Proveedores persistidos mediante Persona/Empresa, Tercero y rol PROVEEDOR. Nombres separados; nombre secundario empresarial opcional; búsqueda en todos los nombres, orden alfabético, filtros y paginación. Crear, consultar, editar y activar/desactivar sin eliminar otros roles del tercero.
- Dirección, municipio, país, correo, NIT, contacto, teléfono, código postal, método de pago y crédito opcionales. Banco, titular y cuenta aplican a transferencia; beneficiario a cheque. No se inventan propietarios ni se agregan sufijos empresariales.
- Marcas: búsqueda, orden alfabético, paginación, edición, estado y prevención de duplicados normalizados.
- Productos: código, nombre, descripción, categoría, subcategoría, marca opcional, unidad, tipo de inventario y stock mínimo. Relaciones verificadas; búsqueda, filtros, paginación, edición, estado y detalle. No hay stock editable ni costo vigente. Los saldos e indicadores todavía no disponibles se muestran como pendientes, sin existencias ficticias.
- React utiliza HTTP real y el token existente. Se conservan layout, componentes institucionales y LanguageContext con español, inglés y francés. Los formularios condicionales y errores nuevos están traducidos.
- Catálogos vacíos devuelven listas vacías. No se sembraron registros institucionales. Para registrar un producto debe existir una categoría válida.

## Permisos y contratos

Administrador puede escribir y consultar información bancaria en el detalle de proveedores. Compras, Finanzas y Solicitante pueden consultar datos generales. Ningún listado, incluido el del administrador, expone cuentas ni beneficiarios. Esta matriz conservadora puede ampliarse después de confirmar los permisos institucionales.

PATCH de edición recibe el formulario completo; los campos opcionales omitidos se vacían, salvo la cuenta bancaria: omitirla conserva la registrada. El tipo de proveedor no cambia durante una edición. Cambiar método de pago conserva la cuenta histórica; no existe borrado de cuentas en esta etapa. Cambios de estado usan una ruta separada y `{ "active": false }` o `true`.

Se reutilizan JWT, Zod, middleware de permisos y errores centralizados. Duplicados devuelven 409 con código específico para entidad; referencias y entradas inválidas no exponen datos bancarios ni detalles internos de Prisma. Los identificadores BigInt se transportan como cadenas. No se permite asignar un catálogo inactivo a una nueva relación; se admite conservar una relación inactiva existente al editar.

## Endpoints

Todos usan prefijo `/api` y `Authorization: Bearer <token>`.

| Recurso | Operaciones |
| --- | --- |
| `/proveedores` | GET listado, POST crear |
| `/proveedores/:id` | GET detalle, PATCH editar |
| `/proveedores/:id/estado` | PATCH estado |
| `/marcas` | GET listado, POST crear |
| `/marcas/:id` | PATCH editar |
| `/marcas/:id/estado` | PATCH estado |
| `/productos` | GET listado, POST crear |
| `/productos/:id` | GET detalle, PATCH editar |
| `/productos/:id/estado` | PATCH estado |
| `/catalogos/:name` | GET catálogo |

Catálogos permitidos: `categorias`, `subcategorias`, `marcas`, `unidades-medida`, `tipos-inventario`, `bodegas`, `clases-contables`.

Consultas de listado: `buscar`, `activo=true/false`, `orden=asc/desc`, `pagina` desde 1, `limite` de 1 a 100. Proveedores: `tipo=person/sole/company`. Productos: `categoriaId`, `marcaId`, `tipoInventarioId`. Las respuestas exitosas usan `{ success: true, data }`; listados incluyen resultados, total y metadatos. Los nombres de campos del formulario están definidos en `inventory.schema.js` y usados por `catalogService.js`.

## Ejecutar contra la base de pruebas

Desde la raíz, con dependencias instaladas y PostgreSQL aislado existente:

```powershell
npm run prisma:generate:sprint5 --prefix backend
npm run dev:sprint5 --prefix backend
```

En otra terminal, si no existe la configuración local del frontend:

```powershell
Copy-Item frontend/.env.sprint5.example frontend/.env.sprint5
```

No sobrescribir un archivo local existente. Luego:

```powershell
npm run dev:sprint5 --prefix frontend
```

Abrir `http://localhost:5174`; API `http://localhost:3001/api`. Iniciar sesión con una cuenta de la base aislada y abrir Proveedores o Inventario; Marcas se administra desde Inventario. No hay credenciales nuevas incluidas en el repositorio.

El lanzador lee la configuración habitual sin editarla y cambia la base únicamente dentro del proceso. Una conexión independiente puede suministrarse mediante `LWI_SPRINT5_DATABASE_URL`, obligatoriamente con nombre de base `sistema_inventario_sprint5_test`. Se permiten `SPRINT5_PORT` y `SPRINT5_FRONTEND_URL` para ajustar puerto y CORS; actualizar también la configuración local del frontend cuando corresponda. El cliente generado se guarda en una carpeta ignorada independiente, evitando reemplazar la DLL usada por un servidor existente.

## Pruebas y resultados

```powershell
$env:LWI_KEEP_TEST_DATA = '1'
npm run test:sprint5 --prefix backend
npm run test:accounts:sprint5 --prefix backend
npm run test:sprint4 --prefix frontend
npm run test:sprint5 --prefix frontend
npm run test:accounts:sprint5 --prefix frontend
npm run build --prefix frontend
node backend/scripts/check-sprint5-schema.cjs
node backend/scripts/sprint5-source-audit.cjs
```

- Backend Sprint 5: 30 pruebas aprobadas, 0 fallidas (incluye pruebas contenedoras, bloqueo del perfil principal y recargas paralelas de catálogos).
- Regresión backend de autenticación/cuentas: 16 aprobadas, 0 fallidas, mediante lanzador aislado.
- React Sprint 4 y Sprint 5: 4 aprobadas, 0 fallidas. Incluyen navegación DOM, formularios dinámicos, tres idiomas, persistencia real por HTTP, recarga, marcas y detalle de producto.
- Regresión interfaz de cuentas: 1 aprobada, 0 fallidas, contra base aislada.
- Build de producción y validación/generación Prisma: aprobados.
- Comparación del esquema aislado: sin diferencias. Historial con `000_baseline` y `001_catalogos_terceros` finalizadas, sin migraciones adicionales.

Resultado final funcional: 51 comprobaciones aprobadas, 0 fallidas, contando las pruebas contenedoras que incluye Node. Las suites se ejecutaron secuencialmente.

La comprobación posterior reprodujo `P2028` también sin suites paralelas: Marcas no podía iniciar su transacción interactiva de lectura durante la ráfaga de consultas de catálogos. El diagnóstico reportó «Unable to start a transaction in the given time» sin bloqueo prolongado del bucle de eventos. Se reemplazaron esas dos lecturas independientes por una transacción por lotes con el mismo aislamiento RepeatableRead, consultas parametrizadas y contrato de respuesta. No se aumentaron tiempos de espera ni se cambió el esquema. La reproducción React pasó después de la corrección y se añadió una regresión con ocho listados de Marcas concurrentes con los seis catálogos. La suite completa pasó nuevamente.

Se levantaron frontend en `http://localhost:5174` y backend en `http://localhost:3001`. La comprobación sobre estos servidores reales obtuvo HTTP 200 en Login, health y consultas autenticadas de Productos, Proveedores, Marcas y Categorías. Solo se usaron lecturas y una identidad de prueba; no se publicaron tokens ni credenciales.

Las pruebas de escritura usan registros identificables exclusivamente en la base aislada. En esta revisión `LWI_KEEP_TEST_DATA=1` desactiva su limpieza: se conservaron los registros creados, incluidos los de corridas intermedias. Los prefijos `s5api_`, `s5ui_` y `test-` identifican datos sintéticos de pruebas; no representan proveedores, marcas o existencias institucionales. No se eliminó ningún registro. No usar los comandos antiguos de cuentas directamente con el `.env` principal; usar los lanzadores anteriores. La prueba React ahora limita los listados a su propio identificador de corrida para no editar otra fila al conservar datos.

## Revisión visual y mejoras del cierre

Se reutilizaron Home, SystemSearch, Modal, CatalogForms, BrandsPanel y los estilos responsivos existentes, sin reconstruir pantallas. Sidebar móvil con Escape y foco controlado; tablas desplazables con teclado; formularios de dos columnas en escritorio y una en móvil; botones de modales accesibles; paneles del Login dimensionados por ancho y alto disponibles. Se mantienen los puntos de ruptura de 820 px (navegación superpuesta) y 600 px (formularios/acceso móvil), además de las consultas de contenedor existentes para tarjetas y filtros.

Mejoras nuevas:

- Una consulta fallida de detalle ya no ofrece un formulario vacío editable: muestra el error con Cerrar y Reintentar.
- Las confirmaciones de activación/desactivación identifican el registro y el estado de destino.
- Los campos requeridos, correo y datos bancarios seleccionados se comprueban antes del envío; los errores se asocian a cada campo y reutilizan mensajes traducidos. Se mantienen las validaciones Zod del servidor y los nombres empresariales secundarios opcionales.
- Marcas corrige la página actual cuando cambia el total y vacía resultados obsoletos ante errores de consulta, con opción de reintentar.

Edge headless con Playwright disponible en el entorno: **511 comprobaciones de distribución aprobadas**, sin errores de JavaScript en página. Se recorrieron Login, recuperación, Inicio, Inventario, Detalle, Proveedores, Usuarios, Configuración y Mi Perfil; formularios de Marcas y los tres tipos de Proveedores; errores, validaciones, navegación y modales. Las peticiones de esta suite visual son interceptadas y no acceden a PostgreSQL. Se inspeccionaron capturas representativas de escritorio, tablet y móvil, incluidas traducciones francesas largas.

Anchos: 320, 375, 430, 768, 1024, 1366, 1920 y 2560 px. También 1366 × 600, 1525 × 695, 1920 × 875 y 1024 × 600 en español, inglés y francés, con aserción de que el Login y su pie caben completos. Modal de poca altura a 320 × 568. Reajuste equivalente al 200 % mediante viewports CSS reducidos; no se afirma una comprobación manual del zoom real.

Para repetir la matriz visual desde `frontend`:

```powershell
$env:LWI_PLAYWRIGHT_PATH = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
npm run test:responsive
```

Si Playwright está instalado en otra ubicación, indicar esa carpeta o resolverlo como módulo local. No se agregó ninguna dependencia. Capturas y `report.json`: `frontend/.responsive-artifacts/`, ignorado por Git. Instrucciones y comprobación breve adicional en `frontend/README.md`.

Los scripts de restauración y preparación en `backend/scripts/` pertenecen a la etapa previa; no son pasos de arranque ni deben repetirse para ejecutar esta integración.

## Archivos y pendientes

Backend: esquema activo, cliente Prisma, montaje de rutas, errores centralizados; módulo nuevo `src/modules/inventory/` con rutas, acceso, validaciones y servicios; lanzadores, auditoría y pruebas Sprint 5; scripts en package.json.

Frontend integrado: Catalog y ProductDetail, servicios/modelo de catálogo, formularios y panel de marcas, traducciones Sprint 5 incorporadas a LanguageContext y estilos responsivos existentes. Este cierre conserva las mejoras previas de Login y no cambia autenticación, API ni modelos.

Archivos modificados en esta revisión: `frontend/src/pages/Catalog.jsx`, `frontend/src/components/CatalogForms.jsx`, `frontend/src/components/BrandsPanel.jsx`; `frontend/responsive.test.mjs`, `frontend/sprint4.test.mjs`, `frontend/sprint5-ui.test.mjs`, `frontend/account-ui.test.mjs`; `backend/sprint5.integration.test.cjs`, `backend/accounts.integration.test.cjs`; esta guía y `frontend/README.md`. La verificación posterior modificó además `backend/src/modules/inventory/inventory.service.js` para corregir el timeout reproducido en Marcas. No se cambiaron endpoints, contratos, credenciales ni migraciones.

Pendientes: autorización para migrar la principal; administración de los demás catálogos; stock inicial, movimientos, valoración y relación de existencias por bodega; adjuntos, reglas internas de Compras y flujo de propietario. No se implementan exportaciones ni datos institucionales de ejemplo. Confirmar matriz definitiva de permisos y política de conservación/actualización de cuentas antes de producción.

Limitaciones para la demostración: registrar productos exige una categoría existente; los catálogos institucionales deben ser aprobados y no se inventan desde la interfaz. Solo se contempla una cuenta por proveedor; conservarla al cambiar método de pago no constituye un historial versionado de cuentas. NIT no incorpora validación oficial externa. Recuperación de contraseña y notificaciones siguen indicando su integración pendiente. Falta validación en Safari, teléfonos físicos, teclado virtual y lector de pantalla; la revisión realizada no es una certificación WCAG.

Guion de demostración: ingresar con una cuenta del entorno aislado; crear persona y empresa con solo su nombre principal, consultar/editar/buscar/filtrar y confirmar cambios de estado; mostrar que los roles de consulta no reciben datos bancarios; registrar y buscar una marca, probar duplicado; crear un producto con categoría real y marca opcional, editarlo y recargar el detalle. Stock y valoración permanecen pendientes. No usar una cuenta de pruebas como credencial institucional.

Recomendación para siguientes sprints: aprobar primero catálogos y permisos de negocio; implementar después Entradas, Salidas, Devoluciones, Movimientos y Stock Inicial con existencias derivadas de movimientos. Preparar una implantación separada de la principal, con respaldo y autorización explícita; no promover datos sintéticos de la base de pruebas.

Advertencia no bloqueante: Prisma 6 informa que `package.json#prisma` quedará obsoleto en Prisma 7. No se actualizó la versión ni se cambió la estrategia de migraciones.

Commit sugerido para este cierre (no ejecutado): `fix: cerrar revisión del Sprint 5 con validaciones y regresiones verificadas`.
