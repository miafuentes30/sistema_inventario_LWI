# Sprint 5 — resultado del ensayo aislado

Estado final: APROBADO técnicamente en la base de pruebas; despliegue principal no autorizado.
Resultado estructurado: [isolated-validation.json](isolated-validation.json).

## Alcance y estado inicial

- Principal: `sistema_inventario`, con tablas `rol` (4 filas) y `usuarios` (1 fila).
- Pruebas: `sistema_inventario_sprint5_test`; se consultó `pg_database` antes de crearla
  y no existía. No se eliminó ni se reutilizó una base anterior.
- Git tenía los archivos de propuesta/scripts sin seguimiento y `.gitignore` modificado
  por la etapa previa. Se conservaron esos cambios; no hubo commit ni push.
- Se verificaron el checksum del respaldo, los hashes de modelos/SQL y la identidad
  del clúster PostgreSQL del backend y Docker. El respaldo coincide con las cuentas actuales.
- Todas las conexiones Prisma de inspección a la principal se crearon con
  `default_transaction_read_only=on`, además de transacciones READ ONLY.

## Restauración

Se creó la base desde `template0`, con codificación y configuración regional de la principal.
Después de comprobar que estaba vacía se restauró el archivo custom con `pg_restore`,
en una sola transacción y con salida inmediata ante errores. No se usó `--clean`.

Se compararon exactamente:

- Tablas, columnas y tipos.
- Claves, índices y relaciones de las cuentas.
- Triggers/funciones existentes.
- Cantidad y huellas de todas las filas, sin imprimir datos personales ni hashes de contraseñas.
- Valores y estado de las secuencias de las cuentas.

Resultado: corresponde al respaldo y a la estructura de origen, con 4 roles y 1 usuario.
Este ensayo completa la comprobación de restauración real que estaba pendiente en el diseño.
El respaldo portable omite propietarios/ACL globales; no equivale a recuperación completa del clúster.

## Migraciones

Se copió la propuesta a un espacio de ensayo ignorado por Git. Su datasource usa
`SPRINT5_TEST_DATABASE_URL`, distinto del usado por el backend activo. Los subprocesos
reciben explícitamente la URL de pruebas; no se cambió el `.env`.

1. El diff entre la estructura restaurada y el esquema baseline fue vacío.
2. Se registró `000_baseline` como aplicada con `prisma migrate resolve --applied`.
   No se ejecutó su SQL CREATE TABLE sobre las cuentas restauradas.
3. `prisma migrate deploy` aplicó únicamente `001_catalogos_terceros`.
4. Se verificó que las dos filas del historial terminaron correctamente y sus checksums
   corresponden a los archivos propuestos.
5. `prisma migrate status` indica que la base está actualizada.

Tablas nuevas, 13:

`personas`, `empresas`, `terceros`, `tercero_roles`, `cuentas_bancarias_tercero`,
`categorias`, `subcategorias`, `marcas`, `unidades_medida`, `tipos_inventario`,
`clases_coa`, `productos`, `bodegas`.

Hay 16 tablas en la base de pruebas: 2 restauradas + 13 nuevas + `_prisma_migrations`.
Se verificaron las 48 restricciones declaradas (PK, FK y CHECK), los 37 índices explícitos
y los 13 triggers de actualización habilitados. Los índices implícitos de las PK no están
incluidos en el número 37.

## Integridad y cliente Prisma

67 comprobaciones aprobadas, 0 fallidas. El listado individual está en el JSON de resultados.
Incluyen:

- Personas con nombres/apellidos separados y campos institucionales.
- Empresas individuales y sociedades con solo nombre principal; nombre secundario y propietario opcionales.
- Propietarios reales por FK, sin inventarlos; rechazo de relaciones/tipos inválidos.
- Exclusividad persona/empresa del tercero y unicidad de la identidad.
- Roles PROVEEDOR/DONANTE, combinaciones válidas y duplicados rechazados.
- Condiciones de pago, crédito, beneficiario y cuenta bancaria opcional; conservación de ceros iniciales.
- Marcas y códigos sin duplicados por mayúsculas/espacios; marcas inactivas no duplicadas.
- Categorías/subcategorías, restricción compuesta de pertenencia a la misma categoría.
- Unidades, tipos de inventario, COA y bodegas con responsable opcional.
- Productos con marca o sin ella y referencias válidas a catálogos.
- Umbral mínimo decimal, cero permitido y negativos/NaN rechazados.
- Protección de referencias mediante FK RESTRICT.
- Funcionamiento de los 13 triggers y rollback sin persistencia parcial.

Se utilizó el cliente generado desde la propuesta para las operaciones válidas y lectura
de relaciones. Los rechazos verifican códigos SQLSTATE reales, no solo mensajes.

`prisma validate` aprobó. El diff final base de pruebas → modelo propuesto es vacío.
Los CHECK, índices de expresiones y triggers se verificaron por catálogo SQL y por pruebas,
porque el diff de Prisma por sí solo no cubre esas características.

Todos los fixtures tienen prefijo `S5TEST_` y se ejecutaron en una transacción finalmente
revertida. Las 13 tablas nuevas quedaron sin filas. Sus secuencias pueden haber avanzado:
PostgreSQL no revierte `nextval`; esto no afecta las secuencias originales de cuentas.
Las cuentas restauradas se preservaron y las pruebas no crearon usuarios ni roles.

## Problema encontrado y corrección

La primera generación del cliente falló porque el esquema temporal, situado fuera de
`backend`, no permitía resolver el paquete ya instalado `@prisma/client`.
La restauración y las migraciones ya habían aprobado; no se eliminaron ni se repitieron.

Se corrigió el arnés: usa una copia temporal de generación bajo
`backend/.sprint5-isolated/<run>/`, excluida de Git, con salida del cliente en el espacio
aislado. No se cambió la propuesta de modelos, el SQL ni el cliente activo.

Antes de reanudar se verificó que la base correspondía a esa ejecución conocida, que
las cuentas y secuencias seguían iguales, que las 13 tablas nuevas estaban vacías y que
el historial y los checksums eran los esperados. Solo entonces continuó la generación
y las pruebas. El informe del primer intento se conserva junto al resultado final.

No se encontraron cambios necesarios en modelos o migraciones para este ensayo.
Persiste el aviso previo de Prisma sobre `package.json#prisma` obsoleto para Prisma 7;
no bloquea la versión instalada y no se hizo una actualización de dependencias.

## Evidencia y conservación

Evidencia privada de esta ejecución:
`.local-backups/sprint5-validation/2026-11-11T03-08-41-344Z/`.
Contiene informes, salida de resolve/deploy/status/generate, diff baseline y diff final,
la copia de ensayo y el cliente generado. Todo permanece excluido de Git.

La comparación final confirma:

- Principal sin cambios en tablas, columnas, claves, índices, funciones, triggers, filas y secuencias.
- La principal sigue sin `_prisma_migrations`.
- Esquema activo, `.env`, paquetes y cliente Prisma operativo sin modificaciones.
- No hubo reset, db push, eliminación de bases, commit ni push.

La base de pruebas se conserva para revisión, con el esquema migrado y las cuentas
restauradas. Contiene copias de datos de autenticación y no debe publicarse ni conectarse
como base operativa. Su eliminación requerirá una instrucción posterior.

## Repetición y siguiente paso

El arnés reproducible es `backend/scripts/validate-sprint5-isolated.cjs` y las comprobaciones
están en `backend/scripts/sprint5-integrity.cjs`.

La ejecución normal rechaza bases preexistentes. Para un ensayo NUEVO, escoger primero
un nombre libre con patrón `sistema_inventario_sprint5_test_<sufijo>` en `LWI_SPRINT5_TEST_DB`.
No establecer esa variable apuntando a la principal. El script también valida el patrón,
`current_database()`, respaldo y estado de origen antes de escribir.

La opción `--resume <run>` no sirve para reutilizar una base arbitraria: exige evidencia
de esa ejecución y vuelve a comprobar que no hay filas nuevas que deban conservarse.

Recomendación: es técnicamente razonable avanzar a integración de backend en el entorno
aislado. Antes de la principal, resolver las decisiones de negocio pendientes del README,
renovar respaldo/detección de drift y obtener autorización explícita. Se detiene aquí.
