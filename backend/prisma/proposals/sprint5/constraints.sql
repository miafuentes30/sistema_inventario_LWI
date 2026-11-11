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
