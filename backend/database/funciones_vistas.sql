-- LWI Guatemala | FASE 2 | Reglas transaccionales, confirmacion y consultas
-- Ejecutar DESPUES de 01_crear_tablas_fase2.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.lwi_fase2_validar_movimiento()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Movimiento % en estado % es inmutable; use un movimiento compensatorio', OLD.id, OLD.estado;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND NEW.estado = 'CONFIRMADO'
     AND coalesce(current_setting('lwi.fase2_confirmando',true),'') <> 'on' THEN
    RAISE EXCEPTION 'No actualizar estado manualmente: use lwi_fase2_confirmar_movimiento';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado <> NEW.estado
     AND NOT (OLD.estado='BORRADOR' AND NEW.estado IN ('CONFIRMADO','ANULADO')) THEN
    RAISE EXCEPTION 'Transicion de estado no permitida';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lwi_fase2_movimientos_guard
BEFORE UPDATE OR DELETE ON public.movimientos
FOR EACH ROW EXECUTE FUNCTION public.lwi_fase2_validar_movimiento();

CREATE OR REPLACE FUNCTION public.lwi_fase2_validar_detalle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_mov public.movimientos%ROWTYPE;
  v_bodega_ubic BIGINT;
BEGIN
  SELECT * INTO v_mov FROM public.movimientos
    WHERE id = CASE WHEN TG_OP='DELETE' THEN OLD.movimiento_id ELSE NEW.movimiento_id END
    FOR SHARE;
  IF NOT FOUND OR v_mov.estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Los detalles solo pueden modificarse en movimientos BORRADOR';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND NEW.movimiento_id <> OLD.movimiento_id THEN
    RAISE EXCEPTION 'No se puede cambiar el encabezado de una linea';
  END IF;
  IF NEW.ubicacion_id IS NOT NULL THEN
    SELECT bodega_id INTO v_bodega_ubic FROM public.ubicaciones WHERE id=NEW.ubicacion_id;
    IF v_bodega_ubic IS DISTINCT FROM v_mov.bodega_id THEN
      RAISE EXCEPTION 'Ubicacion % no corresponde a bodega %',NEW.ubicacion_id,v_mov.bodega_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lwi_fase2_detalle_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.movimiento_detalles
FOR EACH ROW EXECUTE FUNCTION public.lwi_fase2_validar_detalle();

CREATE OR REPLACE FUNCTION public.lwi_fase2_validar_asignacion_devolucion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_estado VARCHAR(12);
  v_tipo VARCHAR(20);
BEGIN
  SELECT m.estado,m.tipo INTO v_estado,v_tipo
    FROM public.movimiento_detalles d JOIN public.movimientos m ON m.id=d.movimiento_id
   WHERE d.id=CASE WHEN TG_OP='DELETE' THEN OLD.devolucion_detalle_id ELSE NEW.devolucion_detalle_id END
   FOR SHARE OF m;
  IF v_estado IS DISTINCT FROM 'BORRADOR' OR v_tipo IS DISTINCT FROM 'DEVOLUCION' THEN
    RAISE EXCEPTION 'Asignaciones permitidas solo en devoluciones BORRADOR';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND NEW.devolucion_detalle_id <> OLD.devolucion_detalle_id THEN
    RAISE EXCEPTION 'No puede cambiarse la linea de devolucion';
  END IF;
  IF NEW.costo_unitario IS NOT NULL AND
     coalesce(current_setting('lwi.fase2_confirmando',true),'') <> 'on' THEN
     RAISE EXCEPTION 'Costo de devolucion establecido solo durante confirmacion';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lwi_fase2_devolucion_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.devoluciones_lote
FOR EACH ROW EXECUTE FUNCTION public.lwi_fase2_validar_asignacion_devolucion();

-- Evitar escrituras accidentales a los libros auxiliares fuera de la funcion.
-- NOTA: usar un rol de BD sin permisos directos de DML sobre estas tablas
-- en produccion; el flag de sesion NO sustituye la seguridad por privilegios.
CREATE OR REPLACE FUNCTION public.lwi_fase2_guardar_libro()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('lwi.fase2_confirmando',true),'') <> 'on' THEN
    RAISE EXCEPTION '% solo puede alterarse durante una confirmacion controlada',TG_TABLE_NAME;
  END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'No se borran asientos de %',TG_TABLE_NAME; END IF;
  IF TG_OP='UPDATE' THEN
    IF TG_TABLE_NAME <> 'lotes' THEN
      RAISE EXCEPTION 'Los consumos historicos no se modifican';
    END IF;
    IF (to_jsonb(NEW) - 'cantidad_disponible' - 'updated_at') IS DISTINCT FROM
       (to_jsonb(OLD) - 'cantidad_disponible' - 'updated_at') THEN
       RAISE EXCEPTION 'Solo el saldo del lote es modificable';
    END IF;
    NEW.updated_at:=now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lwi_fase2_lotes_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.lotes
FOR EACH ROW EXECUTE FUNCTION public.lwi_fase2_guardar_libro();
CREATE TRIGGER trg_lwi_fase2_consumos_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.consumos_lote
FOR EACH ROW EXECUTE FUNCTION public.lwi_fase2_guardar_libro();

-- Funcion atomica (todo o nada) de contabilizacion fisica PEPS.
-- Si falta stock o hay alguna inconsistencia, PostgreSQL revierte todo el movimiento.
CREATE OR REPLACE FUNCTION public.lwi_fase2_confirmar_movimiento(
    p_movimiento_id BIGINT, p_confirmado_por_usuario_id BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_mov public.movimientos%ROWTYPE;
  v_det public.movimiento_detalles%ROWTYPE;
  v_lote public.lotes%ROWTYPE;
  v_consumo public.consumos_lote%ROWTYPE;
  v_dev RECORD;
  v_previo NUMERIC(18,3);
  v_total_actual NUMERIC(18,3);
  v_pendiente NUMERIC(18,3);
  v_tomar NUMERIC(18,3);
  v_suma NUMERIC(18,3);
  v_count BIGINT;
  v_producto_origen BIGINT;
  v_producto_bloqueo RECORD;
  v_movimiento_origen BIGINT;
  v_bodega_origen BIGINT;
  v_ubicacion_origen BIGINT;
BEGIN
  SELECT * INTO v_mov FROM public.movimientos WHERE id=p_movimiento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento % no encontrado',p_movimiento_id; END IF;
  IF v_mov.estado <> 'BORRADOR' THEN
     RAISE EXCEPTION 'Movimiento % no esta en borrador (%).',v_mov.id,v_mov.estado;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_confirmado_por_usuario_id AND activo) THEN
    RAISE EXCEPTION 'Usuario confirmador inexistente o inactivo';
  END IF;
  SELECT count(*) INTO v_count FROM public.movimiento_detalles WHERE movimiento_id=v_mov.id;
  IF v_count=0 THEN RAISE EXCEPTION 'No se confirma un movimiento sin productos'; END IF;

  IF v_mov.tipo='DEVOLUCION' AND NOT EXISTS (
    SELECT 1 FROM public.movimientos m WHERE m.id=v_mov.movimiento_origen_id
    AND m.tipo='SALIDA' AND m.estado='CONFIRMADO'
  ) THEN
    RAISE EXCEPTION 'La devolucion debe referir una SALIDA confirmada';
  END IF;
  IF v_mov.tipo='ENTRADA' AND v_mov.origen IN ('COMPRA','DONACION') THEN
    IF v_mov.tercero_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.tercero_roles tr
      WHERE tr.tercero_id=v_mov.tercero_id AND tr.activo
      AND tr.rol=CASE WHEN v_mov.origen='COMPRA' THEN 'PROVEEDOR' ELSE 'DONANTE' END
    ) THEN
      RAISE EXCEPTION 'Entrada por compra/donacion requiere tercero con rol vigente';
    END IF;
  END IF;
  IF v_mov.fecha_operacion > current_date THEN
    RAISE EXCEPTION 'No se permiten movimientos con fecha futura';
  END IF;

  -- Serializar operaciones del mismo producto+bodega, incluso entradas
  -- que aun no tienen lote. Orden ascendente evita bloqueos cruzados.
  FOR v_producto_bloqueo IN
    SELECT DISTINCT producto_id FROM public.movimiento_detalles
    WHERE movimiento_id=v_mov.id ORDER BY producto_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('LWI_FASE2'),
      hashtext(v_mov.bodega_id::text || ':' || v_producto_bloqueo.producto_id::text)
    );
  END LOOP;

  -- Bloquear actualizaciones espontaneas de saldos y estados.
  PERFORM set_config('lwi.fase2_confirmando','on',true);

  FOR v_det IN SELECT * FROM public.movimiento_detalles
               WHERE movimiento_id=v_mov.id ORDER BY id LOOP
    -- No contabilizar historicos fuera de orden para el mismo producto y bodega.
    -- Esto protege la interpretacion temporal de existencias y PEPS.
    IF EXISTS (
      SELECT 1 FROM public.movimientos m2
      JOIN public.movimiento_detalles d2 ON d2.movimiento_id=m2.id
      WHERE m2.estado='CONFIRMADO' AND m2.bodega_id=v_mov.bodega_id
        AND d2.producto_id=v_det.producto_id
        AND m2.fecha_operacion>v_mov.fecha_operacion
    ) THEN
      RAISE EXCEPTION 'Movimiento fuera de orden cronologico para producto % y bodega %',
        v_det.producto_id,v_mov.bodega_id;
    END IF;
    IF v_mov.tipo IN ('ENTRADA','AJUSTE_ENTRADA') THEN
      IF v_det.costo_unitario IS NULL THEN
        RAISE EXCEPTION 'Detalle % sin costo unitario: se requiere valoracion validada',v_det.id;
      END IF;
      INSERT INTO public.lotes (
        entrada_detalle_id,producto_id,bodega_id,ubicacion_id,
        codigo_lote,fecha_recepcion,fecha_vencimiento,
        cantidad_inicial,cantidad_disponible,costo_unitario
      ) VALUES (
        v_det.id,v_det.producto_id,v_mov.bodega_id,v_det.ubicacion_id,
        v_det.codigo_lote,v_mov.fecha_operacion,v_det.fecha_vencimiento,
        v_det.cantidad,v_det.cantidad,v_det.costo_unitario
      );

    ELSIF v_mov.tipo IN ('SALIDA','AJUSTE_SALIDA') THEN
      v_pendiente:=v_det.cantidad;
      -- PEPS por fecha de recepcion, desempate por id.
      -- Se toma un bloqueo de todos los lotes candidatos para serializar salidas.
      FOR v_lote IN
        SELECT * FROM public.lotes
         WHERE producto_id=v_det.producto_id
           AND bodega_id=v_mov.bodega_id
           AND (v_det.ubicacion_id IS NULL OR ubicacion_id=v_det.ubicacion_id)
           AND fecha_recepcion <= v_mov.fecha_operacion
           AND cantidad_disponible > 0
         ORDER BY fecha_recepcion,id FOR UPDATE
      LOOP
        v_tomar:=least(v_pendiente,v_lote.cantidad_disponible);
        UPDATE public.lotes SET cantidad_disponible=cantidad_disponible-v_tomar
          WHERE id=v_lote.id;
        INSERT INTO public.consumos_lote(salida_detalle_id,lote_id,cantidad,costo_unitario)
          VALUES(v_det.id,v_lote.id,v_tomar,v_lote.costo_unitario);
        v_pendiente:=v_pendiente-v_tomar;
        EXIT WHEN v_pendiente=0;
      END LOOP;
      IF v_pendiente>0 THEN
        RAISE EXCEPTION 'Stock insuficiente: producto %, bodega %, ubicacion %, faltan %',
          v_det.producto_id,v_mov.bodega_id,v_det.ubicacion_id,v_pendiente;
      END IF;

    ELSIF v_mov.tipo='DEVOLUCION' THEN
      SELECT coalesce(sum(cantidad),0) INTO v_suma
        FROM public.devoluciones_lote WHERE devolucion_detalle_id=v_det.id;
      IF v_suma<>v_det.cantidad THEN
        RAISE EXCEPTION 'Detalle %: suma asignada a lotes (%) difiere de cantidad (%)',
          v_det.id,v_suma,v_det.cantidad;
      END IF;
      FOR v_dev IN SELECT id,consumo_lote_id,cantidad FROM public.devoluciones_lote
                    WHERE devolucion_detalle_id=v_det.id ORDER BY consumo_lote_id LOOP
        SELECT * INTO v_consumo FROM public.consumos_lote
          WHERE id=v_dev.consumo_lote_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Consumo original inexistente'; END IF;
        SELECT d.producto_id,d.movimiento_id INTO v_producto_origen,v_movimiento_origen
          FROM public.movimiento_detalles d WHERE d.id=v_consumo.salida_detalle_id;
        SELECT * INTO v_lote FROM public.lotes WHERE id=v_consumo.lote_id FOR UPDATE;
        IF v_producto_origen<>v_det.producto_id OR
           v_movimiento_origen<>v_mov.movimiento_origen_id OR
           v_lote.bodega_id<>v_mov.bodega_id OR
           (v_det.ubicacion_id IS NOT NULL AND
             v_lote.ubicacion_id IS DISTINCT FROM v_det.ubicacion_id) THEN
          RAISE EXCEPTION 'Devolucion % no corresponde a producto, salida, bodega o ubicacion originales',v_dev.id;
        END IF;
        SELECT coalesce(sum(dl.cantidad),0) INTO v_previo
          FROM public.devoluciones_lote dl
          JOIN public.movimiento_detalles dd ON dd.id=dl.devolucion_detalle_id
          JOIN public.movimientos mm ON mm.id=dd.movimiento_id
          WHERE dl.consumo_lote_id=v_consumo.id AND mm.estado='CONFIRMADO';
        SELECT coalesce(sum(dl.cantidad),0) INTO v_total_actual
          FROM public.devoluciones_lote dl
          JOIN public.movimiento_detalles dd ON dd.id=dl.devolucion_detalle_id
          WHERE dl.consumo_lote_id=v_consumo.id AND dd.movimiento_id=v_mov.id;
        IF v_previo+v_total_actual>v_consumo.cantidad THEN
          RAISE EXCEPTION 'Cantidad devuelta supera el consumo original %',v_consumo.id;
        END IF;
        UPDATE public.lotes SET cantidad_disponible=cantidad_disponible+v_dev.cantidad
          WHERE id=v_lote.id;
        UPDATE public.devoluciones_lote SET costo_unitario=v_consumo.costo_unitario
          WHERE id=v_dev.id;
      END LOOP;
    END IF;
  END LOOP;
  UPDATE public.movimientos SET estado='CONFIRMADO',
    confirmado_por_usuario_id=p_confirmado_por_usuario_id,confirmado_at=now()
    WHERE id=v_mov.id;
  PERFORM set_config('lwi.fase2_confirmando','off',true);
END $$;

-- Vista de existencias por lote. Los borradores no generan saldo.
CREATE OR REPLACE VIEW public.vw_lotes_disponibles AS
SELECT l.id AS lote_id,p.codigo AS codigo_producto,p.nombre AS producto,
 l.producto_id,l.bodega_id,b.nombre AS bodega,l.ubicacion_id,
 l.fecha_recepcion,l.fecha_vencimiento,l.codigo_lote,
 l.cantidad_inicial,l.cantidad_disponible,l.costo_unitario,
 (l.cantidad_disponible*l.costo_unitario)::numeric(24,6) AS valor_disponible
FROM public.lotes l
JOIN public.productos p ON p.id=l.producto_id
JOIN public.bodegas b ON b.id=l.bodega_id;

CREATE OR REPLACE VIEW public.vw_stock_producto_bodega AS
SELECT l.producto_id,l.bodega_id,
       sum(l.cantidad_disponible)::numeric(24,3) AS cantidad_disponible,
       sum(l.cantidad_disponible*l.costo_unitario)::numeric(26,6) AS valor_peps,
       min(l.fecha_recepcion) FILTER (WHERE l.cantidad_disponible>0) AS primera_recepcion_disponible
FROM public.lotes l GROUP BY l.producto_id,l.bodega_id;

CREATE OR REPLACE VIEW public.vw_historial_movimientos AS
SELECT m.id,m.numero,m.tipo,m.origen,m.estado,m.fecha_operacion,
 m.bodega_id,m.tercero_id,m.creado_por_usuario_id,m.confirmado_at,
 d.id AS detalle_id,d.producto_id,d.ubicacion_id,d.cantidad,
 CASE WHEN m.tipo IN ('ENTRADA','AJUSTE_ENTRADA','DEVOLUCION') THEN d.cantidad
      ELSE -d.cantidad END AS variacion_cantidad,
 CASE WHEN m.tipo IN ('ENTRADA','AJUSTE_ENTRADA') THEN d.cantidad*d.costo_unitario
      WHEN m.tipo='DEVOLUCION' THEN (
        SELECT sum(dl.cantidad*dl.costo_unitario) FROM public.devoluciones_lote dl
        WHERE dl.devolucion_detalle_id=d.id)
      ELSE -(SELECT sum(c.cantidad*c.costo_unitario) FROM public.consumos_lote c
             WHERE c.salida_detalle_id=d.id) END AS variacion_valor
FROM public.movimientos m JOIN public.movimiento_detalles d ON d.movimiento_id=m.id
WHERE m.estado='CONFIRMADO';

COMMENT ON FUNCTION public.lwi_fase2_confirmar_movimiento(BIGINT,BIGINT)
 IS 'Confirma entradas, salidas PEPS, devoluciones y ajustes en una sola transaccion';

COMMIT;
