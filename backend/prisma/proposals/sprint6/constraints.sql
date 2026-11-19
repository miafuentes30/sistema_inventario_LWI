-- PROPOSAL ONLY. Review together with migration.sql. No seeds or openings.
ALTER TABLE tipos_movimiento ADD CHECK (tipo IN ('ENTRADA','SALIDA','APERTURA'));
ALTER TABLE movimientos ADD CHECK (tipo IN ('ENTRADA','SALIDA','APERTURA')),
  ADD CHECK (estado IN ('BORRADOR','PENDIENTE','CONFIRMADO','CANCELADO')),
  ADD CHECK ((estado='CONFIRMADO' AND confirmado_at IS NOT NULL AND confirmado_por_usuario_id IS NOT NULL)
    OR (estado<>'CONFIRMADO' AND confirmado_at IS NULL AND confirmado_por_usuario_id IS NULL)),
  ADD CHECK (version > 0), ADD CHECK (movimiento_origen_id IS NULL OR movimiento_origen_id<>id);
ALTER TABLE movimiento_detalles ADD CHECK (cantidad>0 AND cantidad<>'NaN'::numeric),
  ADD CHECK (cantidad_solicitada IS NULL OR (cantidad_solicitada>0 AND cantidad_solicitada<>'NaN'::numeric)),
  ADD CHECK (costo_unitario IS NULL OR (costo_unitario>=0 AND costo_unitario<>'NaN'::numeric)),
  ADD CHECK (subtotal IS NOT DISTINCT FROM cantidad*costo_unitario);
ALTER TABLE lotes ADD CHECK (cantidad_inicial>0 AND cantidad_inicial<>'NaN'::numeric),
  ADD CHECK (cantidad_disponible BETWEEN 0 AND cantidad_inicial AND cantidad_disponible<>'NaN'::numeric),
  ADD CHECK (costo_unitario IS NULL OR (costo_unitario>=0 AND costo_unitario<>'NaN'::numeric));
ALTER TABLE asientos_inventario ADD CHECK (cantidad<>0 AND cantidad<>'NaN'::numeric);
ALTER TABLE documentos_movimiento ADD CHECK (tamano IS NULL OR tamano>0),
  ADD CHECK ((storage_key IS NULL AND mime IS NULL AND tamano IS NULL AND sha256 IS NULL)
    OR (storage_key IS NOT NULL AND mime IN ('application/pdf','image/jpeg','image/png') AND tamano IS NOT NULL AND sha256 IS NOT NULL));
CREATE UNIQUE INDEX ux_ubicaciones_codigo_ci ON ubicaciones(bodega_id,upper(btrim(codigo)));

CREATE FUNCTION lwi_s6_proteger_historial() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mid bigint; st text;
BEGIN
  IF TG_TABLE_NAME IN ('asientos_inventario','movimiento_eventos') THEN
    RAISE EXCEPTION 'AUDIT_IMMUTABLE';
  END IF;
  IF TG_TABLE_NAME='movimientos' THEN st:=OLD.estado;
  ELSE
    IF TG_OP='DELETE' THEN mid:=OLD.movimiento_id; ELSE mid:=NEW.movimiento_id; END IF;
    SELECT estado INTO st FROM movimientos WHERE id=mid FOR UPDATE;
    IF TG_OP='UPDATE' AND OLD.movimiento_id<>NEW.movimiento_id THEN RAISE EXCEPTION 'DETAIL_REPARENT_FORBIDDEN'; END IF;
  END IF;
  IF st IS DISTINCT FROM 'BORRADOR' THEN RAISE EXCEPTION 'MOVEMENT_IMMUTABLE'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER s6_movimiento_protegido BEFORE UPDATE OR DELETE ON movimientos FOR EACH ROW EXECUTE FUNCTION lwi_s6_proteger_historial();
CREATE TRIGGER s6_detalle_protegido BEFORE INSERT OR UPDATE OR DELETE ON movimiento_detalles FOR EACH ROW EXECUTE FUNCTION lwi_s6_proteger_historial();
CREATE TRIGGER s6_documento_protegido BEFORE INSERT OR UPDATE OR DELETE ON documentos_movimiento FOR EACH ROW EXECUTE FUNCTION lwi_s6_proteger_historial();
CREATE TRIGGER s6_asiento_inmutable BEFORE UPDATE OR DELETE ON asientos_inventario FOR EACH ROW EXECUTE FUNCTION lwi_s6_proteger_historial();
CREATE TRIGGER s6_evento_inmutable BEFORE UPDATE OR DELETE ON movimiento_eventos FOR EACH ROW EXECUTE FUNCTION lwi_s6_proteger_historial();

CREATE FUNCTION lwi_s6_reconciliar_lote() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lid bigint; saldo numeric; real_saldo numeric;
BEGIN
  IF TG_TABLE_NAME='lotes' THEN lid:=NEW.id; ELSE lid:=NEW.lote_id; END IF;
  SELECT cantidad_disponible INTO saldo FROM lotes WHERE id=lid;
  SELECT coalesce(sum(cantidad),0) INTO real_saldo FROM asientos_inventario WHERE lote_id=lid;
  IF saldo IS DISTINCT FROM real_saldo THEN RAISE EXCEPTION 'STOCK_RECONCILIATION_FAILED'; END IF;
  IF EXISTS(SELECT 1 FROM asientos_inventario a JOIN movimiento_detalles d ON d.id=a.detalle_id JOIN movimientos m ON m.id=d.movimiento_id JOIN lotes l ON l.id=a.lote_id
    WHERE a.lote_id=lid AND (m.estado<>'CONFIRMADO' OR d.producto_id<>l.producto_id OR m.bodega_id<>l.bodega_id
      OR (m.tipo IN ('ENTRADA','APERTURA') AND a.cantidad<=0) OR (m.tipo='SALIDA' AND a.cantidad>=0)))
    THEN RAISE EXCEPTION 'INVALID_LEDGER_ENTRY'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER s6_lote_reconciliable AFTER INSERT OR UPDATE ON lotes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lwi_s6_reconciliar_lote();
CREATE CONSTRAINT TRIGGER s6_asiento_reconciliable AFTER INSERT ON asientos_inventario DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lwi_s6_reconciliar_lote();

CREATE FUNCTION lwi_s6_validar_confirmado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado='CONFIRMADO' THEN
    IF NOT EXISTS(SELECT 1 FROM movimiento_detalles WHERE movimiento_id=NEW.id) THEN RAISE EXCEPTION 'EMPTY_MOVEMENT'; END IF;
    IF EXISTS(SELECT 1 FROM movimiento_detalles d WHERE d.movimiento_id=NEW.id AND
      (d.codigo_producto IS NULL OR d.nombre_producto IS NULL OR d.unidad_nombre IS NULL OR
       (SELECT coalesce(sum(a.cantidad),0) FROM asientos_inventario a WHERE a.detalle_id=d.id)
         <> CASE WHEN NEW.tipo='SALIDA' THEN -d.cantidad ELSE d.cantidad END)) THEN RAISE EXCEPTION 'DETAIL_LEDGER_MISMATCH'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER s6_movimiento_reconciliable AFTER INSERT OR UPDATE ON movimientos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lwi_s6_validar_confirmado();

-- Requires an approved policy and explicit SQL EXECUTE permission. API must also authorize.
-- Explicit lot selection is physical traceability, not FIFO valuation. No output cost is invented.
CREATE FUNCTION lwi_s6_confirmar(p_id bigint,p_actor bigint) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE m movimientos%ROWTYPE; d record; cfg tipos_movimiento%ROWTYPE; lid bigint;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM usuarios u JOIN rol r ON r.id=u.rol_id WHERE u.id=p_actor AND u.activo AND r.activo AND r.nombre='Administrador') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO m FROM movimientos WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF m.estado='CONFIRMADO' THEN RETURN m.id; END IF;
  IF m.estado<>'BORRADOR' THEN RAISE EXCEPTION 'MOVEMENT_IMMUTABLE'; END IF;
  IF m.tipo='APERTURA' THEN RAISE EXCEPTION 'OPENING_NOT_AUTHORIZED'; END IF;
  SELECT * INTO cfg FROM tipos_movimiento WHERE id=m.tipo_movimiento_id FOR SHARE;
  IF NOT cfg.activo OR NOT cfg.politica_confirmada OR cfg.tipo<>m.tipo THEN RAISE EXCEPTION 'POLICY_NOT_APPROVED'; END IF;
  IF m.tipo='SALIDA' AND m.aprobado_por_usuario_id IS NULL THEN RAISE EXCEPTION 'APPROVAL_REQUIRED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM bodegas WHERE id=m.bodega_id AND activo) THEN RAISE EXCEPTION 'INVALID_WAREHOUSE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM usuarios WHERE id=m.responsable_usuario_id AND activo) THEN RAISE EXCEPTION 'INVALID_RESPONSIBLE'; END IF;
  IF cfg.proveedor_requerido AND m.tercero_id IS NULL THEN RAISE EXCEPTION 'INVALID_SUPPLIER'; END IF;
  IF m.tercero_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM terceros t JOIN tercero_roles r ON r.tercero_id=t.id
    LEFT JOIN personas p ON p.id=t.persona_id LEFT JOIN empresas e ON e.id=t.empresa_id
    WHERE t.id=m.tercero_id AND t.activo AND r.rol='PROVEEDOR' AND r.activo AND coalesce(p.activo,e.activo)) THEN RAISE EXCEPTION 'INVALID_SUPPLIER'; END IF;
  IF cfg.documento_requerido AND NOT EXISTS(SELECT 1 FROM documentos_movimiento WHERE movimiento_id=m.id) THEN RAISE EXCEPTION 'DOCUMENT_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM documentos_movimiento WHERE movimiento_id=m.id AND NOT (cfg.documentos_permitidos ? tipo)) THEN RAISE EXCEPTION 'INVALID_DOCUMENT_TYPE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM movimiento_detalles WHERE movimiento_id=m.id) THEN RAISE EXCEPTION 'EMPTY_MOVEMENT'; END IF;
  FOR d IN SELECT * FROM movimiento_detalles WHERE movimiento_id=m.id ORDER BY producto_id,id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(d.producto_id::text||':'||m.bodega_id::text,0));
    IF NOT EXISTS(SELECT 1 FROM productos p JOIN unidades_medida u ON u.id=d.unidad_medida_id
      WHERE p.id=d.producto_id AND p.activo AND u.activo AND p.unidad_medida_id=u.id AND (u.permite_fracciones OR d.cantidad=trunc(d.cantidad))) THEN RAISE EXCEPTION 'INVALID_PRODUCT_UNIT'; END IF;
    IF m.tipo='ENTRADA' AND d.fecha_vencimiento IS NULL AND EXISTS(SELECT 1 FROM productos WHERE id=d.producto_id AND requiere_vencimiento IS TRUE) THEN RAISE EXCEPTION 'EXPIRY_REQUIRED'; END IF;
    UPDATE movimiento_detalles det SET codigo_producto=p.codigo,nombre_producto=p.nombre,unidad_nombre=u.nombre
      FROM productos p,unidades_medida u WHERE det.id=d.id AND p.id=d.producto_id AND u.id=d.unidad_medida_id;
    IF d.ubicacion_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ubicaciones WHERE id=d.ubicacion_id AND bodega_id=m.bodega_id AND activo) THEN RAISE EXCEPTION 'INVALID_LOCATION'; END IF;
    IF m.tipo='ENTRADA' THEN
      IF d.lote_salida_id IS NOT NULL THEN RAISE EXCEPTION 'INVALID_LOT'; END IF;
      IF EXISTS(SELECT 1 FROM lotes l JOIN movimiento_detalles e ON e.id=l.entrada_detalle_id WHERE l.producto_id=d.producto_id
        AND l.cantidad_disponible>0 AND e.unidad_medida_id<>d.unidad_medida_id) THEN RAISE EXCEPTION 'UNIT_CONVERSION_NOT_APPROVED'; END IF;
      INSERT INTO lotes(entrada_detalle_id,producto_id,bodega_id,ubicacion_id,codigo_lote,fecha_recepcion,fecha_vencimiento,cantidad_inicial,cantidad_disponible,costo_unitario)
      VALUES(d.id,d.producto_id,m.bodega_id,d.ubicacion_id,d.codigo_lote,m.fecha_operacion,d.fecha_vencimiento,d.cantidad,d.cantidad,d.costo_unitario) RETURNING id INTO lid;
      INSERT INTO asientos_inventario(detalle_id,lote_id,cantidad) VALUES(d.id,lid,d.cantidad);
    ELSE
      IF d.costo_unitario IS NOT NULL OR d.lote_salida_id IS NULL THEN RAISE EXCEPTION 'EXPLICIT_LOT_REQUIRED'; END IF;
      UPDATE lotes SET cantidad_disponible=cantidad_disponible-d.cantidad WHERE id=d.lote_salida_id AND producto_id=d.producto_id AND bodega_id=m.bodega_id
        AND ubicacion_id IS NOT DISTINCT FROM d.ubicacion_id AND cantidad_disponible>=d.cantidad
        AND EXISTS(SELECT 1 FROM movimiento_detalles e WHERE e.id=lotes.entrada_detalle_id AND e.unidad_medida_id=d.unidad_medida_id)
        RETURNING id INTO lid;
      IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
      INSERT INTO asientos_inventario(detalle_id,lote_id,cantidad) VALUES(d.id,lid,-d.cantidad);
    END IF;
  END LOOP;
  UPDATE movimientos SET estado='CONFIRMADO',confirmado_por_usuario_id=p_actor,confirmado_at=now(),updated_at=now(),version=version+1 WHERE id=m.id;
  INSERT INTO movimiento_eventos(movimiento_id,usuario_id,accion,datos) VALUES(m.id,p_actor,'CONFIRMADO',jsonb_build_object('version',m.version+1));
  RETURN m.id;
END $$;
REVOKE ALL ON FUNCTION lwi_s6_confirmar(bigint,bigint) FROM PUBLIC;
