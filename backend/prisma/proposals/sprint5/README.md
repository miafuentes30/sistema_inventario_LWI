# Sprint 5 — propuesta de diseño y migraciones sin aplicar

Estado: propuesta para revisión. No es una carpeta activa de Prisma Migrate.
El esquema operativo `backend/prisma/schema.prisma` sigue intacto.

Actualización: se autorizó y completó el ensayo en la base nueva
`sistema_inventario_sprint5_test`. Restauración, migraciones y 67 pruebas de integridad
aprobaron. La base principal permanece intacta. Véanse `VALIDACION_AISLADA.md` e
`isolated-validation.json`. La aplicación del diseño sobre la principal sigue pendiente
de autorización; los resultados siguientes describen la etapa de diseño original.

## Resultado comprobado durante la etapa de diseño

- PostgreSQL 16.15, base configurada `sistema_inventario`, esquema `public`.
- Solo existen `rol` y `usuarios`, con 4 y 1 registros respectivamente.
- No existe historial `_prisma_migrations`.
- Respaldo local verificado: consultar `backupRelativeDirectory` y `backupSha256`
  en `verification.json`. Incluye SQL de esquema, archivo custom, lista de objetos y manifiesto.
- El archivo custom se decodificó completo sin errores y contiene los datos de ambas tablas.
  Se omiten propietarios y ACL en este respaldo portable: no es un respaldo de roles/permisos
  globales del servidor. Su restitución debe planificarse si se necesitara recuperar todo el clúster.
- Prisma validó la propuesta y el diff base real→esquema activo está vacío.
- El delta contiene 13 tablas nuevas. Se comprobó que sus ALTER apuntan solo a esas tablas;
  no hay otra entidad `proveedores`, ni saldo/costo vigente editable en productos.
- El esquema activo sigue idéntico a Git HEAD. Las huellas de todas las filas de cuentas
  siguen coincidiendo con el snapshot después de generar los archivos.
- Se verificó sintaxis JavaScript de ambos scripts y `git diff --check`.
- No se aplicó ningún SQL, no se restauraron bases ni se ejecutaron seeds o pruebas con escritura.
  La validez sintáctica Prisma y la revisión estática no prueban todavía la ejecución de los
  CHECK, triggers o índices: esas pruebas quedan para el ensayo aislado posterior.

## Estrategia establecida antes de generar las migraciones

1. Inspeccionar la base indicada por el `.env` local mediante consultas de solo lectura.
2. Crear un respaldo consistente de toda esa base con `pg_dump` 16 en formato custom,
   usando un snapshot exportado por una transacción de lectura. Verificar que Docker
   y la URL del backend apuntan al mismo clúster antes del respaldo.
3. Comprobar SHA-256, catálogo del archivo, presencia de datos de ambas tablas y
   descompresión completa con `pg_restore --file=/dev/null`, sin conexión de restauración.
   Comparar huellas y cantidades de filas de origen antes/después. El respaldo contiene
   datos sensibles y queda en `.local-backups/`, excluido de Git.
4. Preparar una línea base que representa solo las tablas actuales `rol` y `usuarios`.
   En una base existente NO se ejecuta su SQL: tras aprobación se marcaría como aplicada
   con Prisma `migrate resolve --applied`. Esto crearía el historial de Prisma, pero
   tampoco está autorizado para esta etapa. En una base nueva sí correspondería aplicar
   la línea base. Nunca repetir las instrucciones de creación sobre las cuentas actuales.
5. Comprobar con `migrate diff` de lectura que el esquema activo coincide con la base.
   Si aparece drift, detener la generación y revisar. No usar `db pull` sobre el archivo activo.
6. Generar sin conexión de escritura el delta desde el esquema operativo hasta el propuesto.
   Añadir los CHECK, índices de expresiones y triggers que Prisma no expresa.
7. Revisar y aprobar los archivos. Antes de autorizar despliegue, restaurar en una base
   AISLADA, verificar las cuentas, ensayar allí el historial, las migraciones y los casos
   de integridad. Esta etapa NO restaura bases, NO aplica migraciones y NO crea `_prisma_migrations`.

No se usa `migrate dev` ni una shadow database: `migrate diff` produce texto SQL.
No se ejecutan `db push`, `migrate reset`, los SQL históricos completos ni seeds.
No existe un script de rollback destructivo: antes de confirmar la transacción PostgreSQL
puede revertirla; después se prepara una corrección hacia adelante revisada.

## Archivos

- `schema.prisma`: modelo completo propuesto, separado del esquema activo.
- `migrations/000_baseline/migration.sql`: representación revisable de las cuentas existentes;
  NO ejecutar sobre la base actual.
- `migrations/001_catalogos_terceros/migration.sql`: delta aditivo propuesto con integridad SQL.
- `constraints.sql`: fuente de las reglas SQL suplementarias.
- `relaciones.mmd`: diagrama Mermaid.
- `verification.json`: comprobaciones sin datos de usuarios ni secretos; detalla límites de prueba.
- `../../../scripts/backup-sprint5.cjs`: respaldo de solo lectura; invocación desde raíz:
  `node backend/scripts/backup-sprint5.cjs`.
- `../../../scripts/prepare-sprint5.cjs`: validación y generación de archivos, sin aplicar SQL.

## Modelos y relaciones

| Modelo | Tabla | Uso y cardinalidad |
| --- | --- | --- |
| Rol / Usuario | rol / usuarios | Cuentas actuales preservadas; un rol tiene varios usuarios. |
| Persona | personas | Nombres y apellidos separados y obligatorios. |
| Empresa | empresas | INDIVIDUAL o JURIDICA; nombre principal obligatorio y secundario opcional. |
| Tercero | terceros | Identidad de exactamente una persona O una empresa; una identidad no se duplica como tercero. |
| TerceroRol | tercero_roles | Clave compuesta tercero+rol; PROVEEDOR o DONANTE. Un tercero puede tener ambos. |
| CuentaBancariaTercero | cuentas_bancarias_tercero | Extensión opcional 0..1 del rol PROVEEDOR; no es otra entidad proveedor. |
| Categoria / Subcategoria | categorias / subcategorias | Una categoría tiene varias subcategorías; el producto no puede usar una subcategoría de otra categoría. |
| Marca | marcas | Nombre único normalizado; relación 0..1 marca por producto y 0..N productos por marca. |
| UnidadMedida | unidades_medida | Código, nombre y permiso de fracciones. |
| TipoInventario | tipos_inventario | Catálogo independiente; no se asimila a categoría ni COA. |
| ClaseCoa | clases_coa | Se conserva la clasificación contable opcional ya prevista en SQL para no reemplazarla por tipos de inventario. |
| Producto | productos | Catálogo, relaciones, mínimo y revisión; sin stock inicial, saldo disponible ni costo vigente editables. |
| Bodega | bodegas | Catálogo independiente; responsable Usuario opcional. Aún no asocia existencias a productos. |

No se crea una tabla `proveedores`. Listarlos equivaldrá a consultar `tercero_roles`
con `rol = 'PROVEEDOR'`, unir la identidad y respetar los estados de tercero, entidad y rol.
Las reglas de estado efectivo y autorización se implementarán en servicios posteriores.

### Mapeo de los tres tipos de proveedor

| Interfaz | Identidad SQL | Nombre principal | Nombre secundario |
| --- | --- | --- | --- |
| Persona individual | personas | nombres | apellidos (obligatorio) |
| Empresa individual | empresas, tipo INDIVIDUAL | nombre_comercial (etiqueta «Nombre de empresa») | razon_social (etiqueta provisional «Nombre social», opcional) |
| Empresa / Sociedad | empresas, tipo JURIDICA | nombre_comercial | razon_social (opcional) |

No se agrega «S. A.», no se copia el principal al secundario y no se traduce el contenido
de nombres. El significado de «Nombre social» sigue pendiente: el mapeo es una propuesta,
no una conclusión jurídica. Si tiene significado distinto, se ajusta ANTES de aplicar SQL.

`propietario_persona_id` es opcional para INDIVIDUAL y apunta exclusivamente a una Persona
real. Puede vincularse después; no se crean propietarios ficticios. Para JURIDICA se mantiene
nulo, respetando la distinción existente. No se modelan socios ni representantes legales.

### Formulario institucional

Se preservan los campos de contacto ya definidos por SQL en personas/empresas y se agregan
municipio, país, nombre de contacto y código postal. Se mantienen separados según identidad;
la exclusividad en Tercero evita dos identidades simultáneas. No son obligatorios sin una regla
de negocio confirmada. Teléfono, NIT, códigos postales y cuentas se almacenan como texto.

Condiciones comerciales en TerceroRol, solo para PROVEEDOR:

- `metodo_pago`: opcional, TRANSFERENCIA o CHEQUE.
- `dias_credito`: opcional; 0 = contra entrega, o 15, 30, 60 días, según el formulario.
  NULL significa desconocido, no «contra entrega».
- `beneficiario_cheque`: opcional y permitido solo con CHEQUE.
- Datos bancarios: relación opcional; al registrar una cuenta se exigen banco, titular y número.
  No se exige una cuenta a todo proveedor, ni se borra al cambiar método de pago.
  Su obligatoriedad para completar el proceso de transferencia será validación del servicio,
  cuando se confirme si se admite guardar formularios incompletos.

Los CHECK evitan vacíos/espacios en nombres obligatorios y en textos opcionales informados.
No se imponen algoritmos de NIT ni una lista de países sin confirmación. La validación de correo
y las autorizaciones corresponden al backend futuro. Los campos bancarios requieren respuestas
restringidas; nunca deben aparecer completos en listados generales ni logs.

No se incluyen adjuntos, verificación de documentos ni reglas internas de Compras.

## Diferencias frente al SQL histórico

- Solo se proponen las entidades de esta etapa, más ClaseCoa por su relación existente con Producto.
  Ubicaciones, vínculos tercero-producto, movimientos, lotes, permisos, auditoría, vistas y funciones
  de otras fases se revisarán posteriormente. Los SQL actuales contienen esas fases y no deben
  ejecutarse completos para instalar esta propuesta.
- `razon_social` pasa a ser opcional en el DISEÑO nuevo. No se altera ninguna empresa existente,
  porque esa tabla no está instalada en la base inspeccionada.
- El propietario deja de ser obligatorio para empresas individuales en el DISEÑO nuevo.
- Se añaden datos institucionales, condiciones comerciales, cuenta bancaria y tipos de inventario.
- `stock_minimo` es un umbral Decimal(18,3), no una existencia. Se permite NULL o valor >= 0.
- Unidad y tipo de inventario son opcionales durante revisión/importación, como el catálogo
  incompleto previsto por el SQL; deben confirmarse antes de habilitar movimientos.
- Los índices normalizan extremos y mayúsculas/minúsculas sin quitar acentos. Marcas duplicadas
  se rechazan también estando inactivas: corresponde reactivar, no crear otra fila.
- El NIT se compara sin guiones/espacios y sin distinguir mayúsculas, dentro de cada tipo de entidad.
  No se impone unicidad global entre persona y empresa: puede compartirse por la empresa individual
  y su propietario. Es una decisión pendiente de ratificación.
- IDs nuevos usan la representación `BIGSERIAL` que genera Prisma `autoincrement()`, compatible
  con los IDs actuales. El SQL histórico proponía IDENTITY para tablas nuevas; no se convierten
  las secuencias de cuentas existentes.
- Se conserva el FK actual usuarios→rol con ON UPDATE CASCADE / ON DELETE RESTRICT.
  Nuevos FK usan RESTRICT; Bodega→Usuario cambia la propuesta histórica SET NULL por RESTRICT
  para proteger referencias, sin alterar usuarios existentes. No se habilita eliminación física.
- Se añade una función de timestamp y triggers únicamente sobre tablas nuevas, con nombres nuevos.
  No se ejecuta el DROP TRIGGER del script histórico ni se reemplazan funciones existentes.

## Riesgos y operaciones que requieren revisión

- El SQL de baseline contiene CREATE TABLE para `rol` y `usuarios`: repetirlo en la base actual
  provocaría error. Se registra como baseline, NO se ejecuta sobre esa base.
- El delta tiene que contener solo CREATE de tablas/índices/función/triggers nuevos y ALTER TABLE
  ADD CONSTRAINT sobre tablas NUEVAS. No debe contener DROP, TRUNCATE, DELETE, UPDATE de datos,
  ALTER de cuentas, cambios de columnas existentes ni carga de datos.
- Agregar un FK que referencia usuarios puede adquirir un bloqueo breve sobre esa tabla;
  un despliegue futuro debe planificarse con timeout y ventana controlada.
- CHECK y los índices de expresiones no están representados completamente por Prisma. Deben
  conservarse en migraciones futuras y revisarse al introspectar; no reemplazar el SQL por generación ciega.
- Un respaldo verificado por lectura/descompresión todavía no demuestra una restauración real.
  Falta ensayarla en una base aislada antes de aplicar la propuesta.
- La aplicación y la base pueden cambiar después del diagnóstico. Repetir respaldo y detección
  de drift inmediatamente antes de cualquier despliegue autorizado.
- No hay seeds ni datos de catálogos en esta etapa: no se infieren marcas ni tipos reales.
- El esquema propuesto no proporciona todavía CRUD, permisos, aperturas ni persistencia de pantallas.

## Decisiones pendientes

1. Confirmar el significado de «Nombre social» de empresa individual.
2. Confirmar si se necesita más de una cuenta por proveedor; se propone una opcional por ahora.
3. Confirmar campos obligatorios y si se permite guardar información comercial incompleta.
4. Confirmar listado/códigos reales de tipos de inventario, unidades y bodegas.
5. Ratificar política de NIT compartido persona/empresa individual y de duplicados con acentos.
6. Definir permisos para información bancaria y si se necesita cifrado a nivel de aplicación.
7. Posteriormente: valoración, movimientos iniciales y control de aperturas duplicadas.

## Límite de autorización de la propuesta original

La aprobación original autorizó diseñar y generar propuestas, sin aplicar cambios.
La autorización posterior permitió el ensayo aislado documentado en `VALIDACION_AISLADA.md`.
No existe autorización para aplicar migraciones sobre `sistema_inventario`.
