-- PROPOSAL ONLY. Do not apply until reviewed and approved.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- CreateTable
CREATE TABLE "personas" (
    "id" BIGSERIAL NOT NULL,
    "nombres" VARCHAR(120) NOT NULL,
    "apellidos" VARCHAR(120) NOT NULL,
    "nit" VARCHAR(25),
    "telefono" VARCHAR(40),
    "correo" VARCHAR(180),
    "direccion" TEXT,
    "municipio" VARCHAR(160),
    "pais" VARCHAR(100),
    "nombre_contacto" VARCHAR(200),
    "codigo_postal" VARCHAR(20),
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empresas" (
    "id" BIGSERIAL NOT NULL,
    "nombre_comercial" VARCHAR(200) NOT NULL,
    "razon_social" VARCHAR(250),
    "tipo_empresa" VARCHAR(12) NOT NULL,
    "forma_juridica" VARCHAR(100),
    "propietario_persona_id" BIGINT,
    "nit" VARCHAR(25),
    "telefono" VARCHAR(40),
    "correo" VARCHAR(180),
    "direccion" TEXT,
    "municipio" VARCHAR(160),
    "pais" VARCHAR(100),
    "nombre_contacto" VARCHAR(200),
    "codigo_postal" VARCHAR(20),
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terceros" (
    "id" BIGSERIAL NOT NULL,
    "persona_id" BIGINT,
    "empresa_id" BIGINT,
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terceros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tercero_roles" (
    "tercero_id" BIGINT NOT NULL,
    "rol" VARCHAR(15) NOT NULL,
    "metodo_pago" VARCHAR(20),
    "dias_credito" INTEGER,
    "beneficiario_cheque" VARCHAR(250),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tercero_roles_pkey" PRIMARY KEY ("tercero_id","rol")
);

-- CreateTable
CREATE TABLE "cuentas_bancarias_tercero" (
    "tercero_id" BIGINT NOT NULL,
    "rol" VARCHAR(15) NOT NULL DEFAULT 'PROVEEDOR',
    "banco" VARCHAR(160) NOT NULL,
    "nombre_cuenta" VARCHAR(250) NOT NULL,
    "numero_cuenta" VARCHAR(80) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuentas_bancarias_tercero_pkey" PRIMARY KEY ("tercero_id","rol")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" BIGSERIAL NOT NULL,
    "codigo" VARCHAR(40),
    "nombre" VARCHAR(200) NOT NULL,
    "descripcion" TEXT,
    "pendiente_revision" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcategorias" (
    "id" BIGSERIAL NOT NULL,
    "categoria_id" BIGINT NOT NULL,
    "codigo" VARCHAR(40),
    "nombre" VARCHAR(200) NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcategorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marcas" (
    "id" BIGSERIAL NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marcas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidades_medida" (
    "id" BIGSERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "simbolo" VARCHAR(20),
    "permite_fracciones" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unidades_medida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_inventario" (
    "id" BIGSERIAL NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tipos_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clases_coa" (
    "id" BIGSERIAL NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(200),
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clases_coa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" BIGSERIAL NOT NULL,
    "codigo" VARCHAR(80) NOT NULL,
    "nombre" VARCHAR(255) NOT NULL,
    "descripcion" TEXT,
    "categoria_id" BIGINT NOT NULL,
    "subcategoria_id" BIGINT,
    "unidad_medida_id" BIGINT,
    "marca_id" BIGINT,
    "tipo_inventario_id" BIGINT,
    "clase_coa_id" BIGINT,
    "es_perecedero" BOOLEAN,
    "requiere_vencimiento" BOOLEAN,
    "stock_minimo" DECIMAL(18,3),
    "fuente_importacion" VARCHAR(160),
    "pendiente_revision" BOOLEAN NOT NULL DEFAULT true,
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bodegas" (
    "id" BIGSERIAL NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "descripcion" TEXT,
    "direccion" TEXT,
    "responsable_usuario_id" BIGINT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bodegas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_empresas_propietario" ON "empresas"("propietario_persona_id");

-- CreateIndex
CREATE UNIQUE INDEX "terceros_persona_id_key" ON "terceros"("persona_id");

-- CreateIndex
CREATE UNIQUE INDEX "terceros_empresa_id_key" ON "terceros"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_codigo_key" ON "categorias"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nombre_key" ON "categorias"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "uq_subcategorias_id_categoria" ON "subcategorias"("id", "categoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_subcategorias_categoria_nombre" ON "subcategorias"("categoria_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "uq_subcategorias_categoria_codigo" ON "subcategorias"("categoria_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "marcas_nombre_key" ON "marcas"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "unidades_medida_codigo_key" ON "unidades_medida"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "unidades_medida_nombre_key" ON "unidades_medida"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_inventario_codigo_key" ON "tipos_inventario"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_inventario_nombre_key" ON "tipos_inventario"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "clases_coa_codigo_key" ON "clases_coa"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "productos_codigo_key" ON "productos"("codigo");

-- CreateIndex
CREATE INDEX "ix_productos_categoria" ON "productos"("categoria_id");

-- CreateIndex
CREATE INDEX "ix_productos_subcategoria" ON "productos"("subcategoria_id");

-- CreateIndex
CREATE INDEX "ix_productos_unidad" ON "productos"("unidad_medida_id");

-- CreateIndex
CREATE INDEX "ix_productos_marca" ON "productos"("marca_id");

-- CreateIndex
CREATE INDEX "ix_productos_tipo_inventario" ON "productos"("tipo_inventario_id");

-- CreateIndex
CREATE INDEX "ix_productos_clase_coa" ON "productos"("clase_coa_id");

-- CreateIndex
CREATE UNIQUE INDEX "bodegas_codigo_key" ON "bodegas"("codigo");

-- CreateIndex
CREATE INDEX "ix_bodegas_responsable" ON "bodegas"("responsable_usuario_id");

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_propietario_persona_id_fkey" FOREIGN KEY ("propietario_persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tercero_roles" ADD CONSTRAINT "tercero_roles_tercero_id_fkey" FOREIGN KEY ("tercero_id") REFERENCES "terceros"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cuentas_bancarias_tercero" ADD CONSTRAINT "cuentas_bancarias_tercero_tercero_id_rol_fkey" FOREIGN KEY ("tercero_id", "rol") REFERENCES "tercero_roles"("tercero_id", "rol") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "subcategorias" ADD CONSTRAINT "subcategorias_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "fk_productos_subcategoria_categoria" FOREIGN KEY ("subcategoria_id", "categoria_id") REFERENCES "subcategorias"("id", "categoria_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_unidad_medida_id_fkey" FOREIGN KEY ("unidad_medida_id") REFERENCES "unidades_medida"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marcas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_tipo_inventario_id_fkey" FOREIGN KEY ("tipo_inventario_id") REFERENCES "tipos_inventario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_clase_coa_id_fkey" FOREIGN KEY ("clase_coa_id") REFERENCES "clases_coa"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "bodegas" ADD CONSTRAINT "bodegas_responsable_usuario_id_fkey" FOREIGN KEY ("responsable_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Supplemental PostgreSQL integrity rules not expressed in schema.prisma.
-- Proposal only. Included in the additive migration; do not run separately.

ALTER TABLE "personas" ADD CONSTRAINT "ck_personas_textos" CHECK (
  length(btrim(nombres)) > 0 AND length(btrim(apellidos)) > 0
  AND (nit IS NULL OR length(btrim(nit)) > 0)
  AND (telefono IS NULL OR length(btrim(telefono)) > 0)
  AND (correo IS NULL OR length(btrim(correo)) > 0)
  AND (direccion IS NULL OR length(btrim(direccion)) > 0)
  AND (municipio IS NULL OR length(btrim(municipio)) > 0)
  AND (pais IS NULL OR length(btrim(pais)) > 0)
  AND (nombre_contacto IS NULL OR length(btrim(nombre_contacto)) > 0)
  AND (codigo_postal IS NULL OR length(btrim(codigo_postal)) > 0)
);
CREATE UNIQUE INDEX "ux_personas_nit_normalizado" ON "personas"
  (upper(regexp_replace(nit, '[-[:space:]]', '', 'g'))) WHERE nit IS NOT NULL;
ALTER TABLE "personas" ADD CONSTRAINT "ck_personas_nit_normalizado" CHECK (
  nit IS NULL OR length(regexp_replace(nit, '[-[:space:]]', '', 'g')) > 0
);

ALTER TABLE "empresas" ADD CONSTRAINT "ck_empresas_tipo" CHECK (tipo_empresa IN ('INDIVIDUAL','JURIDICA'));
ALTER TABLE "empresas" ADD CONSTRAINT "ck_empresas_propietario" CHECK (
  tipo_empresa = 'INDIVIDUAL' OR propietario_persona_id IS NULL
);
ALTER TABLE "empresas" ADD CONSTRAINT "ck_empresas_textos" CHECK (
  length(btrim(nombre_comercial)) > 0
  AND (razon_social IS NULL OR length(btrim(razon_social)) > 0)
  AND (forma_juridica IS NULL OR length(btrim(forma_juridica)) > 0)
  AND (nit IS NULL OR length(regexp_replace(nit, '[-[:space:]]', '', 'g')) > 0)
  AND (telefono IS NULL OR length(btrim(telefono)) > 0)
  AND (correo IS NULL OR length(btrim(correo)) > 0)
  AND (direccion IS NULL OR length(btrim(direccion)) > 0)
  AND (municipio IS NULL OR length(btrim(municipio)) > 0)
  AND (pais IS NULL OR length(btrim(pais)) > 0)
  AND (nombre_contacto IS NULL OR length(btrim(nombre_contacto)) > 0)
  AND (codigo_postal IS NULL OR length(btrim(codigo_postal)) > 0)
);
CREATE UNIQUE INDEX "ux_empresas_nit_normalizado" ON "empresas"
  (upper(regexp_replace(nit, '[-[:space:]]', '', 'g'))) WHERE nit IS NOT NULL;

ALTER TABLE "terceros" ADD CONSTRAINT "ck_terceros_entidad_exclusiva"
  CHECK ((persona_id IS NOT NULL) <> (empresa_id IS NOT NULL));
ALTER TABLE "tercero_roles" ADD CONSTRAINT "ck_tercero_roles_rol" CHECK (rol IN ('PROVEEDOR','DONANTE'));
ALTER TABLE "tercero_roles" ADD CONSTRAINT "ck_tercero_roles_metodo_pago"
  CHECK (metodo_pago IS NULL OR metodo_pago IN ('TRANSFERENCIA','CHEQUE'));
ALTER TABLE "tercero_roles" ADD CONSTRAINT "ck_tercero_roles_credito"
  CHECK (dias_credito IS NULL OR dias_credito IN (0,15,30,60));
ALTER TABLE "tercero_roles" ADD CONSTRAINT "ck_tercero_roles_condiciones_proveedor" CHECK (
  rol = 'PROVEEDOR' OR (metodo_pago IS NULL AND dias_credito IS NULL AND beneficiario_cheque IS NULL)
);
ALTER TABLE "tercero_roles" ADD CONSTRAINT "ck_tercero_roles_beneficiario" CHECK (
  beneficiario_cheque IS NULL OR
  (metodo_pago IS NOT NULL AND metodo_pago = 'CHEQUE' AND length(btrim(beneficiario_cheque)) > 0)
);
ALTER TABLE "cuentas_bancarias_tercero" ADD CONSTRAINT "ck_cuentas_bancarias_proveedor"
  CHECK (rol = 'PROVEEDOR');
ALTER TABLE "cuentas_bancarias_tercero" ADD CONSTRAINT "ck_cuentas_bancarias_textos"
  CHECK (length(btrim(banco)) > 0 AND length(btrim(nombre_cuenta)) > 0 AND length(btrim(numero_cuenta)) > 0);

ALTER TABLE "categorias" ADD CONSTRAINT "ck_categorias_textos"
  CHECK (length(btrim(nombre)) > 0 AND (codigo IS NULL OR length(btrim(codigo)) > 0));
CREATE UNIQUE INDEX "ux_categorias_nombre_ci" ON "categorias" (lower(btrim(nombre)));
CREATE UNIQUE INDEX "ux_categorias_codigo_ci" ON "categorias" (upper(btrim(codigo))) WHERE codigo IS NOT NULL;
ALTER TABLE "subcategorias" ADD CONSTRAINT "ck_subcategorias_textos"
  CHECK (length(btrim(nombre)) > 0 AND (codigo IS NULL OR length(btrim(codigo)) > 0));
CREATE UNIQUE INDEX "ux_subcategorias_nombre_ci" ON "subcategorias" (categoria_id, lower(btrim(nombre)));
CREATE UNIQUE INDEX "ux_subcategorias_codigo_ci" ON "subcategorias" (categoria_id, upper(btrim(codigo))) WHERE codigo IS NOT NULL;
ALTER TABLE "marcas" ADD CONSTRAINT "ck_marcas_nombre" CHECK (length(btrim(nombre)) > 0);
CREATE UNIQUE INDEX "ux_marcas_nombre_ci" ON "marcas" (lower(btrim(nombre)));
ALTER TABLE "unidades_medida" ADD CONSTRAINT "ck_unidades_medida_textos"
  CHECK (length(btrim(codigo)) > 0 AND length(btrim(nombre)) > 0 AND (simbolo IS NULL OR length(btrim(simbolo)) > 0));
CREATE UNIQUE INDEX "ux_unidades_medida_codigo_ci" ON "unidades_medida" (upper(btrim(codigo)));
CREATE UNIQUE INDEX "ux_unidades_medida_nombre_ci" ON "unidades_medida" (lower(btrim(nombre)));
ALTER TABLE "tipos_inventario" ADD CONSTRAINT "ck_tipos_inventario_textos"
  CHECK (length(btrim(codigo)) > 0 AND length(btrim(nombre)) > 0);
CREATE UNIQUE INDEX "ux_tipos_inventario_codigo_ci" ON "tipos_inventario" (upper(btrim(codigo)));
CREATE UNIQUE INDEX "ux_tipos_inventario_nombre_ci" ON "tipos_inventario" (lower(btrim(nombre)));
ALTER TABLE "clases_coa" ADD CONSTRAINT "ck_clases_coa_textos"
  CHECK (length(btrim(codigo)) > 0 AND (nombre IS NULL OR length(btrim(nombre)) > 0));
CREATE UNIQUE INDEX "ux_clases_coa_codigo_ci" ON "clases_coa" (upper(btrim(codigo)));
ALTER TABLE "productos" ADD CONSTRAINT "ck_productos_textos" CHECK (length(btrim(codigo)) > 0 AND length(btrim(nombre)) > 0);
ALTER TABLE "productos" ADD CONSTRAINT "ck_productos_stock_minimo" CHECK (
  stock_minimo IS NULL OR (stock_minimo >= 0 AND stock_minimo <> 'NaN'::numeric)
);
CREATE UNIQUE INDEX "ux_productos_codigo_ci" ON "productos" (upper(btrim(codigo)));
ALTER TABLE "bodegas" ADD CONSTRAINT "ck_bodegas_textos"
  CHECK (length(btrim(codigo)) > 0 AND length(btrim(nombre)) > 0);
CREATE UNIQUE INDEX "ux_bodegas_codigo_ci" ON "bodegas" (upper(btrim(codigo)));

-- New function and new triggers only. No DROP/REPLACE of existing objects.
CREATE FUNCTION public.lwi_s5_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_s5_updated_at BEFORE UPDATE ON "personas" FOR EACH ROW EXECUTE FUNCTION public.lwi_s5_touch_updated_at();
CREATE TRIGGER trg_s5_updated_at BEFORE UPDATE ON "empresas" FOR EACH ROW EXECUTE FUNCTION public.lwi_s5_touch_updated_at();
CREATE TRIGGER trg_s5_updated_at BEFORE UPDATE ON "terceros" FOR EACH ROW EXECUTE FUNCTION public.lwi_s5_touch_updated_at();
CREATE TRIGGER trg_s5_updated_at BEFORE UPDATE ON "tercero_roles" FOR EACH ROW EXECUTE FUNCTION public.lwi_s5_touch_updated_at();
CREATE TRIGGER trg_s5_updated_at BEFORE UPDATE ON "cuentas_bancarias_tercero" FOR EACH ROW EXECUTE FUNCTION public.lwi_s5_touch_updated_at();
CREATE TRIGGER trg_s5_updated_at BEFORE UPDATE ON "categorias" FOR EACH ROW EXECUTE FUNCTION public.lwi_s5_touch_updated_at();
CREATE TRIGGER trg_s5_updated_at BEFORE UPDATE ON "subcategorias" FOR EACH ROW EXECUTE FUNCTION public.lwi_s5_touch_updated_at();
CREATE TRIGGER trg_s5_updated_at BEFORE UPDATE ON "marcas" FOR EACH ROW EXECUTE FUNCTION public.lwi_s5_touch_updated_at();
CREATE TRIGGER trg_s5_updated_at BEFORE UPDATE ON "unidades_medida" FOR EACH ROW EXECUTE FUNCTION public.lwi_s5_touch_updated_at();
CREATE TRIGGER trg_s5_updated_at BEFORE UPDATE ON "tipos_inventario" FOR EACH ROW EXECUTE FUNCTION public.lwi_s5_touch_updated_at();
CREATE TRIGGER trg_s5_updated_at BEFORE UPDATE ON "clases_coa" FOR EACH ROW EXECUTE FUNCTION public.lwi_s5_touch_updated_at();
CREATE TRIGGER trg_s5_updated_at BEFORE UPDATE ON "productos" FOR EACH ROW EXECUTE FUNCTION public.lwi_s5_touch_updated_at();
CREATE TRIGGER trg_s5_updated_at BEFORE UPDATE ON "bodegas" FOR EACH ROW EXECUTE FUNCTION public.lwi_s5_touch_updated_at();

COMMIT;
