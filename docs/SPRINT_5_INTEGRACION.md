# Sprint 5: integración sobre PostgreSQL aislado

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
npm run test:sprint5 --prefix backend
npm run test:accounts:sprint5 --prefix backend
cd frontend
node --test sprint4.test.mjs sprint5-ui.test.mjs
cd ..
npm run test:accounts:sprint5 --prefix frontend
npm run build --prefix frontend
node backend/scripts/check-sprint5-schema.cjs
node backend/scripts/sprint5-source-audit.cjs
```

- Backend Sprint 5: 29 pruebas aprobadas, 0 fallidas (incluye pruebas contenedoras y bloqueo del perfil principal).
- Regresión backend de autenticación/cuentas: 16 aprobadas, 0 fallidas, mediante lanzador aislado.
- React Sprint 4 y Sprint 5: 4 aprobadas, 0 fallidas. Incluyen navegación DOM, formularios dinámicos, tres idiomas, persistencia real por HTTP, recarga, marcas y detalle de producto.
- Regresión interfaz de cuentas: 1 aprobada, 0 fallidas, contra base aislada.
- Build de producción y validación/generación Prisma: aprobados.
- Comparación del esquema aislado: sin diferencias. Historial con `000_baseline` y `001_catalogos_terceros` finalizadas, sin migraciones adicionales.

Las pruebas de escritura usan registros identificables y limpieza específica, exclusivamente en la base aislada. Ejecutar las suites de escritura secuencialmente. No usar los comandos antiguos de pruebas de cuentas directamente con el `.env` principal; usar los lanzadores anteriores. No se ejecutó una revisión visual manual en navegador de escritorio/tablet/móvil; las verificaciones de interfaz fueron automatizadas en DOM.

Los scripts de restauración y preparación en `backend/scripts/` pertenecen a la etapa previa; no son pasos de arranque ni deben repetirse para ejecutar esta integración.

## Archivos y pendientes

Backend: esquema activo, cliente Prisma, montaje de rutas, errores centralizados; módulo nuevo `src/modules/inventory/` con rutas, acceso, validaciones y servicios; lanzadores, auditoría y pruebas Sprint 5; scripts en package.json.

Frontend: Catalog y ProductDetail, servicios/modelo de catálogo, formularios y panel de marcas nuevos, traducciones Sprint 5 incorporadas a LanguageContext, estilos existentes ampliados, configuración de ejemplo y pruebas. No se modificó Login.

Pendientes: autorización para migrar la principal; administración de los demás catálogos; stock inicial, movimientos, valoración y relación de existencias por bodega; adjuntos, reglas internas de Compras y flujo de propietario. No se implementan exportaciones ni datos institucionales de ejemplo. Confirmar matriz definitiva de permisos y política de conservación/actualización de cuentas antes de producción.

Advertencia no bloqueante: Prisma 6 informa que `package.json#prisma` quedará obsoleto en Prisma 7. No se actualizó la versión ni se cambió la estrategia de migraciones.

Commit sugerido (no ejecutado): `feat: integrar proveedores, marcas y productos en entorno aislado del Sprint 5`.
