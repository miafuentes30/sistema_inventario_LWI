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


-- =====================================================================================================
-- LWI Guatemala | Fase 3 | Flujos y reglas de integridad
-- Funciones SECURITY INVOKER: el backend debe autenticar/autorizAR 
-- =====================================================================================================

BEGIN;

-- Triggers updated_at para cabeceras editables de fase 3.
CREATE OR REPLACE FUNCTION public.lwi_fase3_tocar_fecha()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at:=now(); RETURN NEW; END $$;
CREATE TRIGGER trg_f3_proyectos_fecha BEFORE UPDATE ON public.proyectos
  FOR EACH ROW EXECUTE FUNCTION public.lwi_fase3_tocar_fecha();

-- Bloquear cambios que eludan el flujo de requisiciones.
CREATE OR REPLACE FUNCTION public.lwi_fase3_guardar_solicitud()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE autorizado BOOLEAN;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.estado<>'BORRADOR' THEN RAISE EXCEPTION 'No eliminar solicitud fuera de BORRADOR'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.estado<>'BORRADOR' THEN RAISE EXCEPTION 'Toda solicitud comienza en BORRADOR'; END IF;
    RETURN NEW;
  END IF;
  autorizado:=coalesce(current_setting('lwi.fase3_solicitud_cambio',true),'')='on';
  IF OLD.estado<>'BORRADOR' THEN
    IF NOT autorizado THEN RAISE EXCEPTION 'Solicitud % bloqueada en estado %',OLD.id,OLD.estado; END IF;
    IF (to_jsonb(NEW)-'estado'-'updated_at') IS DISTINCT FROM
       (to_jsonb(OLD)-'estado'-'updated_at') THEN
      RAISE EXCEPTION 'La solicitud registrada no permite editar sus datos';
    END IF;
  END IF;
  IF OLD.estado<>NEW.estado AND NOT autorizado THEN
    RAISE EXCEPTION 'Cambie estado de solicitud mediante funciones Fase 3';
  END IF;
  NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER trg_f3_solicitud_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.solicitudes
FOR EACH ROW EXECUTE FUNCTION public.lwi_fase3_guardar_solicitud();

CREATE OR REPLACE FUNCTION public.lwi_fase3_guardar_solicitud_det()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_estado VARCHAR(15); v_id BIGINT; v_cambio BOOLEAN;
BEGIN
  v_id:=CASE WHEN TG_OP='DELETE' THEN OLD.solicitud_id ELSE NEW.solicitud_id END;
  SELECT estado INTO v_estado FROM public.solicitudes WHERE id=v_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud de detalle no existe'; END IF;
  IF TG_OP='DELETE' THEN
    IF v_estado<>'BORRADOR' THEN RAISE EXCEPTION 'Detalle de solicitud inmutable'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND NEW.solicitud_id<>OLD.solicitud_id THEN
    RAISE EXCEPTION 'No reasignar detalle a otra solicitud';
  END IF;
  v_cambio:=coalesce(current_setting('lwi.fase3_solicitud_cambio',true),'')='on';
  IF v_estado='BORRADOR' THEN
    IF NEW.cantidad_autorizada IS NOT NULL THEN
      RAISE EXCEPTION 'Cantidad autorizada la establece aprobador, no solicitante';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND v_estado='PENDIENTE' AND v_cambio AND
     (to_jsonb(NEW)-'cantidad_autorizada')=(to_jsonb(OLD)-'cantidad_autorizada') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Detalle solo editable en BORRADOR, salvo autorizacion controlada';
END $$;
CREATE TRIGGER trg_f3_solicitud_det_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.solicitud_detalles
FOR EACH ROW EXECUTE FUNCTION public.lwi_fase3_guardar_solicitud_det();

CREATE OR REPLACE FUNCTION public.lwi_fase3_guardar_aprobacion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Aprobacion historica inmutable'; END IF;
  IF coalesce(current_setting('lwi.fase3_solicitud_cambio',true),'')<>'on' THEN
    RAISE EXCEPTION 'Registre aprobacion usando lwi_fase3_decidir_solicitud';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_f3_aprobacion_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.aprobaciones
FOR EACH ROW EXECUTE FUNCTION public.lwi_fase3_guardar_aprobacion();

CREATE OR REPLACE FUNCTION public.lwi_fase3_presentar_solicitud(p_id BIGINT,p_usuario BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v public.solicitudes%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.solicitudes WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v.estado<>'BORRADOR' THEN RAISE EXCEPTION 'Solicitud no esta en BORRADOR'; END IF;
  IF v.solicitante_usuario_id<>p_usuario OR NOT EXISTS (
    SELECT 1 FROM public.usuarios WHERE id=p_usuario AND activo
  ) THEN RAISE EXCEPTION 'Solicitante invalido'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.solicitud_detalles WHERE solicitud_id=p_id) THEN
    RAISE EXCEPTION 'La solicitud necesita al menos un producto';
  END IF;
  PERFORM set_config('lwi.fase3_solicitud_cambio','on',true);
  UPDATE public.solicitudes SET estado='PENDIENTE',presentada_at=now() WHERE id=p_id;
  PERFORM set_config('lwi.fase3_solicitud_cambio','off',true);
END $$;

CREATE OR REPLACE FUNCTION public.lwi_fase3_decidir_solicitud(
 p_id BIGINT,p_aprobador BIGINT,p_decision VARCHAR,p_motivo TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v public.solicitudes%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.solicitudes WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v.estado<>'PENDIENTE' THEN RAISE EXCEPTION 'Solicitud no esta pendiente'; END IF;
  IF p_decision NOT IN ('APROBADA','RECHAZADA') OR p_decision IS NULL THEN
    RAISE EXCEPTION 'Decision debe ser APROBADA o RECHAZADA';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.usuarios u JOIN public.rol r ON r.id=u.rol_id
     WHERE u.id=p_aprobador AND u.activo AND r.activo) THEN
    RAISE EXCEPTION 'Aprobador inexistente o inactivo';
  END IF;
  -- Politica de que rol puede aprobar: restringir en API con permisos LWI;
  -- pasar un ID no prueba identidad por si solo.
  PERFORM set_config('lwi.fase3_solicitud_cambio','on',true);
  IF p_decision='APROBADA' THEN
    UPDATE public.solicitud_detalles SET cantidad_autorizada=coalesce(cantidad_autorizada,cantidad_solicitada)
    WHERE solicitud_id=p_id;
    IF NOT EXISTS(SELECT 1 FROM public.solicitud_detalles
        WHERE solicitud_id=p_id AND cantidad_autorizada>0) THEN
      RAISE EXCEPTION 'Para aprobar, se requiere alguna cantidad autorizada';
    END IF;
  END IF;
  INSERT INTO public.aprobaciones(solicitud_id,aprobador_usuario_id,decision,motivo)
  VALUES(p_id,p_aprobador,p_decision,p_motivo);
  UPDATE public.solicitudes SET estado=p_decision WHERE id=p_id;
  PERFORM set_config('lwi.fase3_solicitud_cambio','off',true);
END $$;


-- Cancelacion explicita de requisicion aun no aprobada.
CREATE OR REPLACE FUNCTION public.lwi_fase3_cancelar_solicitud(p_id BIGINT,p_usuario BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v public.solicitudes%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.solicitudes WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v.estado NOT IN ('BORRADOR','PENDIENTE') THEN
    RAISE EXCEPTION 'No se puede cancelar una solicitud aprobada/despachada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u JOIN public.rol r ON r.id=u.rol_id
    WHERE u.id=p_usuario AND u.activo AND r.activo
     AND (u.id=v.solicitante_usuario_id OR r.nombre='Administrador')) THEN
    RAISE EXCEPTION 'Solo solicitante activo o administrador puede cancelar';
  END IF;
  PERFORM set_config('lwi.fase3_solicitud_cambio','on',true);
  UPDATE public.solicitudes SET estado='CANCELADA' WHERE id=p_id;
  PERFORM set_config('lwi.fase3_solicitud_cambio','off',true);
END $$;

CREATE OR REPLACE FUNCTION public.lwi_fase3_guardar_orden()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE autorizado BOOLEAN;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.estado<>'BORRADOR' THEN RAISE EXCEPTION 'Orden emitida inmutable'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.estado<>'BORRADOR' THEN RAISE EXCEPTION 'Orden debe comenzar BORRADOR'; END IF;
    RETURN NEW;
  END IF;
  autorizado:=coalesce(current_setting('lwi.fase3_orden_cambio',true),'')='on';
  IF OLD.estado<>'BORRADOR' THEN
    IF NOT autorizado OR
       (to_jsonb(NEW)-'estado'-'updated_at') IS DISTINCT FROM
       (to_jsonb(OLD)-'estado'-'updated_at') THEN
      RAISE EXCEPTION 'Orden emitida solo cambia estado por flujo controlado';
    END IF;
  END IF;
  IF OLD.estado<>NEW.estado AND NOT autorizado THEN
    RAISE EXCEPTION 'Use lwi_fase3_emitir_orden';
  END IF;
  NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER trg_f3_orden_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.ordenes_compra
FOR EACH ROW EXECUTE FUNCTION public.lwi_fase3_guardar_orden();

CREATE OR REPLACE FUNCTION public.lwi_fase3_guardar_orden_det()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_estado VARCHAR(12); v_id BIGINT;
BEGIN
  v_id:=CASE WHEN TG_OP='DELETE' THEN OLD.orden_compra_id ELSE NEW.orden_compra_id END;
  SELECT estado INTO v_estado FROM public.ordenes_compra WHERE id=v_id FOR SHARE;
  IF v_estado IS DISTINCT FROM 'BORRADOR' THEN
    RAISE EXCEPTION 'Detalle de orden solo modificable antes de emision';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND NEW.orden_compra_id<>OLD.orden_compra_id THEN
    RAISE EXCEPTION 'No reasignar renglon de compra';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_f3_orden_det_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.orden_compra_detalles
FOR EACH ROW EXECUTE FUNCTION public.lwi_fase3_guardar_orden_det();

CREATE OR REPLACE FUNCTION public.lwi_fase3_emitir_orden(p_id BIGINT,p_usuario BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v public.ordenes_compra%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.ordenes_compra WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v.estado<>'BORRADOR' THEN RAISE EXCEPTION 'Orden no esta en BORRADOR'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_usuario AND activo) THEN
    RAISE EXCEPTION 'Emisor de orden no esta activo';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tercero_roles
     WHERE tercero_id=v.proveedor_tercero_id AND rol='PROVEEDOR' AND activo) THEN
    RAISE EXCEPTION 'La orden necesita un tercero PROVEEDOR activo';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.orden_compra_detalles WHERE orden_compra_id=p_id) THEN
    RAISE EXCEPTION 'No emitir una orden vacia';
  END IF;
  PERFORM set_config('lwi.fase3_orden_cambio','on',true);
  UPDATE public.ordenes_compra SET estado='EMITIDA',emitida_por_usuario_id=p_usuario,
      fecha_emision=now() WHERE id=p_id;
  PERFORM set_config('lwi.fase3_orden_cambio','off',true);
END $$;


-- Cancelacion de orden aun no recibida; no anula recepciones contabilizadas.
CREATE OR REPLACE FUNCTION public.lwi_fase3_cancelar_orden(p_id BIGINT,p_usuario BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v public.ordenes_compra%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.ordenes_compra WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v.estado NOT IN ('BORRADOR','EMITIDA') THEN
    RAISE EXCEPTION 'Orden con recepciones no admite cancelacion simplificada';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.usuarios u JOIN public.rol r ON r.id=u.rol_id
    WHERE u.id=p_usuario AND u.activo AND r.activo
      AND (u.id=v.solicitante_usuario_id OR r.nombre='Administrador')) THEN
    RAISE EXCEPTION 'Usuario sin autorizacion para cancelar orden';
  END IF;
  IF EXISTS(SELECT 1 FROM public.movimientos m
       WHERE m.orden_compra_id=p_id AND m.estado='CONFIRMADO') THEN
    RAISE EXCEPTION 'Orden ya tiene recepciones confirmadas';
  END IF;
  PERFORM set_config('lwi.fase3_orden_cambio','on',true);
  UPDATE public.ordenes_compra SET estado='CANCELADA' WHERE id=p_id;
  PERFORM set_config('lwi.fase3_orden_cambio','off',true);
END $$;

CREATE OR REPLACE FUNCTION public.lwi_fase3_guardar_factura()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_estado VARCHAR(12);
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Factura registrada inmutable; corregir con documento nuevo'; END IF;
  SELECT estado INTO v_estado FROM public.ordenes_compra WHERE id=NEW.orden_compra_id;
  IF v_estado NOT IN ('EMITIDA','PARCIAL','RECIBIDA') THEN
    RAISE EXCEPTION 'Factura requiere orden emitida';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_f3_factura_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.facturas_compra
FOR EACH ROW EXECUTE FUNCTION public.lwi_fase3_guardar_factura();

-- Conteos: apertura obtiene foto de inventario por ubicacion.
CREATE OR REPLACE FUNCTION public.lwi_fase3_guardar_conteo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE autorizado BOOLEAN;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.estado<>'BORRADOR' THEN RAISE EXCEPTION 'Conteo iniciado inmutable'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.estado<>'BORRADOR' THEN RAISE EXCEPTION 'Conteo debe iniciar BORRADOR'; END IF;
    RETURN NEW;
  END IF;
  autorizado:=coalesce(current_setting('lwi.fase3_conteo_cambio',true),'')='on';
  IF OLD.estado<>'BORRADOR' THEN
    IF NOT autorizado THEN RAISE EXCEPTION 'Conteo % bloqueado',OLD.id; END IF;
    IF (to_jsonb(NEW)-'estado'-'updated_at'-'fecha_cierre'-'cerrado_por_usuario_id')
       IS DISTINCT FROM
       (to_jsonb(OLD)-'estado'-'updated_at'-'fecha_cierre'-'cerrado_por_usuario_id') THEN
      RAISE EXCEPTION 'Solo puede cambiar estado/cierre del conteo iniciado';
    END IF;
  END IF;
  IF OLD.estado<>NEW.estado AND NOT autorizado THEN
    RAISE EXCEPTION 'Use funciones de apertura/cierre/cancelacion';
  END IF;
  NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER trg_f3_conteo_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.conteos_fisicos
FOR EACH ROW EXECUTE FUNCTION public.lwi_fase3_guardar_conteo();

CREATE OR REPLACE FUNCTION public.lwi_fase3_guardar_conteo_det()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_estado VARCHAR(12); v_bodega BIGINT; v_bodega_ubic BIGINT; v_id BIGINT;
BEGIN
  v_id:=CASE WHEN TG_OP='DELETE' THEN OLD.conteo_id ELSE NEW.conteo_id END;
  SELECT estado,bodega_id INTO v_estado,v_bodega
    FROM public.conteos_fisicos WHERE id=v_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conteo inexistente'; END IF;
  IF TG_OP='DELETE' OR v_estado<>'EN_CONTEO' AND
      coalesce(current_setting('lwi.fase3_conteo_abriendo',true),'')<>'on' THEN
    RAISE EXCEPTION 'Solo actualizar conteos EN_CONTEO; no borrar detalles';
  END IF;
  IF TG_OP<>'DELETE' AND NEW.ubicacion_id IS NOT NULL THEN
    SELECT bodega_id INTO v_bodega_ubic FROM public.ubicaciones WHERE id=NEW.ubicacion_id;
    IF v_bodega_ubic IS DISTINCT FROM v_bodega THEN
      RAISE EXCEPTION 'Ubicacion no corresponde a la bodega del conteo';
    END IF;
  END IF;
  IF TG_OP='INSERT' THEN
    IF coalesce(current_setting('lwi.fase3_conteo_abriendo',true),'')<>'on'
       AND (NEW.cantidad_sistema<>0 OR NEW.cantidad_contada IS NOT NULL) THEN
      RAISE EXCEPTION 'Nuevo articulo inesperado inicia con cantidad_sistema=0 y sin conteo';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.conteo_id<>OLD.conteo_id OR
     (to_jsonb(NEW)-'cantidad_contada'-'observaciones'-'registrado_por_usuario_id'-'updated_at'-'diferencia')
       IS DISTINCT FROM
     (to_jsonb(OLD)-'cantidad_contada'-'observaciones'-'registrado_por_usuario_id'-'updated_at'-'diferencia') THEN
    RAISE EXCEPTION 'No editar el inventario teorico ni identidad del renglon';
  END IF;
  NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER trg_f3_conteo_det_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.conteo_detalles
FOR EACH ROW EXECUTE FUNCTION public.lwi_fase3_guardar_conteo_det();

CREATE OR REPLACE FUNCTION public.lwi_fase3_abrir_conteo(p_id BIGINT,p_usuario BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v public.conteos_fisicos%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.conteos_fisicos WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v.estado<>'BORRADOR' THEN RAISE EXCEPTION 'Conteo no esta en BORRADOR'; END IF;
  IF v.responsable_usuario_id<>p_usuario OR NOT EXISTS(
     SELECT 1 FROM public.usuarios WHERE id=p_usuario AND activo) THEN
    RAISE EXCEPTION 'Solo el responsable activo puede abrir este conteo';
  END IF;
  -- MISMO bloqueo advisory utilizado por el trigger de confirmacion Fase 3.
  PERFORM pg_advisory_xact_lock(hashtext('LWI_F3_BODEGA'),hashtext(v.bodega_id::text));
  IF EXISTS (SELECT 1 FROM public.conteos_fisicos
       WHERE bodega_id=v.bodega_id AND estado='EN_CONTEO') THEN
    RAISE EXCEPTION 'Existe otro conteo en curso para esta bodega';
  END IF;
  IF EXISTS(SELECT 1 FROM public.conteo_detalles WHERE conteo_id=p_id) THEN
    RAISE EXCEPTION 'Conteo borrador debe estar sin detalles antes de abrirlo';
  END IF;
  PERFORM set_config('lwi.fase3_conteo_abriendo','on',true);
  INSERT INTO public.conteo_detalles(conteo_id,producto_id,ubicacion_id,cantidad_sistema)
    SELECT p_id,l.producto_id,l.ubicacion_id,sum(l.cantidad_disponible)::numeric(18,3)
    FROM public.lotes l WHERE l.bodega_id=v.bodega_id
    GROUP BY l.producto_id,l.ubicacion_id;
  PERFORM set_config('lwi.fase3_conteo_abriendo','off',true);
  PERFORM set_config('lwi.fase3_conteo_cambio','on',true);
  UPDATE public.conteos_fisicos SET estado='EN_CONTEO',fecha_inicio=now() WHERE id=p_id;
  PERFORM set_config('lwi.fase3_conteo_cambio','off',true);
END $$;

CREATE OR REPLACE FUNCTION public.lwi_fase3_cerrar_conteo(p_id BIGINT,p_usuario BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v public.conteos_fisicos%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.conteos_fisicos WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v.estado<>'EN_CONTEO' THEN RAISE EXCEPTION 'Conteo no esta abierto'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_usuario AND activo) THEN
    RAISE EXCEPTION 'Usuario de cierre inactivo';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.conteo_detalles WHERE conteo_id=p_id) THEN
    RAISE EXCEPTION 'No cerrar conteo sin renglones';
  END IF;
  IF EXISTS(SELECT 1 FROM public.conteo_detalles
     WHERE conteo_id=p_id AND cantidad_contada IS NULL) THEN
    RAISE EXCEPTION 'Hay productos sin cantidad contada';
  END IF;
  PERFORM set_config('lwi.fase3_conteo_cambio','on',true);
  UPDATE public.conteos_fisicos SET estado='CERRADO',fecha_cierre=now(),
    cerrado_por_usuario_id=p_usuario WHERE id=p_id;
  PERFORM set_config('lwi.fase3_conteo_cambio','off',true);
END $$;

CREATE OR REPLACE FUNCTION public.lwi_fase3_cancelar_conteo(p_id BIGINT,p_usuario BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v public.conteos_fisicos%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.conteos_fisicos WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v.estado NOT IN ('BORRADOR','EN_CONTEO') THEN
    RAISE EXCEPTION 'Solo cancelar conteos BORRADOR o EN_CONTEO';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_usuario AND activo) THEN
    RAISE EXCEPTION 'Usuario inactivo';
  END IF;
  PERFORM set_config('lwi.fase3_conteo_cambio','on',true);
  UPDATE public.conteos_fisicos SET estado='CANCELADO' WHERE id=p_id;
  PERFORM set_config('lwi.fase3_conteo_cambio','off',true);
END $$;

CREATE OR REPLACE FUNCTION public.lwi_fase3_guardar_adjunto()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Evidencias documentales registradas son inmutables; conservar rastro de auditoria';
END $$;
CREATE TRIGGER trg_f3_adjunto_guard
BEFORE UPDATE OR DELETE ON public.archivos_adjuntos
FOR EACH ROW EXECUTE FUNCTION public.lwi_fase3_guardar_adjunto();

-- VALIDACION TRANSACCIONAL: se activa al confirmar la operacion F2.
-- El objetivo es impedir SALIDAS sin requisicion aprobada y ENTRADAS
-- POR COMPRA sin orden emitida, con control de parciales concurrentes.
CREATE OR REPLACE FUNCTION public.lwi_fase3_validar_confirmacion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
 v_s public.solicitudes%ROWTYPE;
 v_o public.ordenes_compra%ROWTYPE;
 v_fact public.facturas_compra%ROWTYPE;
 v_det RECORD;
 v_obj RECORD;
 v_previo NUMERIC(18,3);
 v_actual NUMERIC(18,3);
 v_max NUMERIC(18,3);
BEGIN
  IF OLD.estado<>'BORRADOR' OR NEW.estado<>'CONFIRMADO' THEN RETURN NEW; END IF;
  -- Serie de un mismo almacen y bloqueo de conteo en curso.
  PERFORM pg_advisory_xact_lock(hashtext('LWI_F3_BODEGA'),hashtext(NEW.bodega_id::text));
  IF EXISTS(SELECT 1 FROM public.conteos_fisicos
      WHERE bodega_id=NEW.bodega_id AND estado='EN_CONTEO') THEN
    RAISE EXCEPTION 'Bodega % en conteo fisico: no confirmar movimientos',NEW.bodega_id;
  END IF;
  IF NEW.solicitud_id IS NOT NULL AND
       NOT (NEW.tipo='SALIDA' AND NEW.origen='REQUISICION') THEN
    RAISE EXCEPTION 'solicitud_id solo se admite en SALIDA/REQUISICION';
  END IF;
  IF NEW.orden_compra_id IS NOT NULL AND
       NOT (NEW.tipo='ENTRADA' AND NEW.origen='COMPRA') THEN
    RAISE EXCEPTION 'orden_compra_id solo se admite en ENTRADA/COMPRA';
  END IF;
  IF NEW.factura_compra_id IS NOT NULL AND NEW.orden_compra_id IS NULL THEN
    RAISE EXCEPTION 'Factura de compra requiere orden de compra';
  END IF;
  IF NEW.conteo_fisico_id IS NOT NULL AND NEW.tipo NOT IN ('AJUSTE_ENTRADA','AJUSTE_SALIDA') THEN
    RAISE EXCEPTION 'conteo_fisico_id solo se admite en ajustes';
  END IF;
  IF NEW.conteo_fisico_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.conteos_fisicos cf
    WHERE cf.id=NEW.conteo_fisico_id AND cf.bodega_id=NEW.bodega_id AND cf.estado='CERRADO'
  ) THEN RAISE EXCEPTION 'Ajuste relacionado debe referir conteo CERRADO en misma bodega'; END IF;

  IF NEW.tipo='SALIDA' AND NEW.origen='REQUISICION' THEN
    IF NEW.solicitud_id IS NULL THEN
      RAISE EXCEPTION 'SALIDA por REQUISICION requiere solicitud_id (Fase 3)';
    END IF;
    SELECT * INTO v_s FROM public.solicitudes WHERE id=NEW.solicitud_id FOR UPDATE;
    IF NOT FOUND OR v_s.estado NOT IN ('APROBADA','PARCIAL') OR v_s.bodega_id<>NEW.bodega_id THEN
      RAISE EXCEPTION 'Solicitud debe estar aprobada/parcial y pertenecer a la misma bodega';
    END IF;
    IF NEW.proyecto_id IS NOT NULL AND NEW.proyecto_id IS DISTINCT FROM v_s.proyecto_id THEN
      RAISE EXCEPTION 'Proyecto del despacho no coincide con solicitud';
    END IF;
    IF EXISTS(SELECT 1 FROM public.movimiento_detalles d WHERE d.movimiento_id=NEW.id
      AND (d.solicitud_detalle_id IS NULL OR d.orden_compra_detalle_id IS NOT NULL OR d.conteo_detalle_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'Cada producto despachado debe vincularse a detalle de solicitud';
    END IF;
    FOR v_det IN SELECT DISTINCT solicitud_detalle_id AS id FROM public.movimiento_detalles
        WHERE movimiento_id=NEW.id LOOP
      SELECT sd.solicitud_id,sd.producto_id,sd.cantidad_autorizada AS cantidad
        INTO v_obj FROM public.solicitud_detalles sd WHERE sd.id=v_det.id;
      IF NOT FOUND OR v_obj.solicitud_id<>v_s.id OR v_obj.cantidad IS NULL OR
          EXISTS(SELECT 1 FROM public.movimiento_detalles d WHERE d.movimiento_id=NEW.id
               AND d.solicitud_detalle_id=v_det.id AND d.producto_id<>v_obj.producto_id) THEN
        RAISE EXCEPTION 'Linea de despacho no coincide con detalle autorizado %',v_det.id;
      END IF;
      SELECT coalesce(sum(d.cantidad),0) INTO v_previo
       FROM public.movimientos m JOIN public.movimiento_detalles d ON d.movimiento_id=m.id
       WHERE m.estado='CONFIRMADO' AND d.solicitud_detalle_id=v_det.id;
      SELECT coalesce(sum(d.cantidad),0) INTO v_actual FROM public.movimiento_detalles d
        WHERE d.movimiento_id=NEW.id AND d.solicitud_detalle_id=v_det.id;
      IF v_previo+v_actual>v_obj.cantidad THEN
        RAISE EXCEPTION 'Despacho excede autorizacion: detalle %, autorizado %, previo %, nuevo %',
          v_det.id,v_obj.cantidad,v_previo,v_actual;
      END IF;
    END LOOP;
  ELSIF NEW.tipo='ENTRADA' AND NEW.origen='COMPRA' THEN
    IF NEW.orden_compra_id IS NULL THEN
      RAISE EXCEPTION 'ENTRADA por COMPRA requiere orden_compra_id (Fase 3)';
    END IF;
    SELECT * INTO v_o FROM public.ordenes_compra WHERE id=NEW.orden_compra_id FOR UPDATE;
    IF NOT FOUND OR v_o.estado NOT IN ('EMITIDA','PARCIAL') OR
        v_o.bodega_destino_id<>NEW.bodega_id OR v_o.proveedor_tercero_id IS DISTINCT FROM NEW.tercero_id THEN
      RAISE EXCEPTION 'Compra debe referir orden emitida, proveedor y bodega correctos';
    END IF;
    IF NEW.proyecto_id IS NOT NULL AND NEW.proyecto_id IS DISTINCT FROM v_o.proyecto_id THEN
      RAISE EXCEPTION 'Proyecto de recepcion no coincide con orden de compra';
    END IF;
    IF NEW.factura_compra_id IS NOT NULL THEN
      SELECT * INTO v_fact FROM public.facturas_compra WHERE id=NEW.factura_compra_id;
      IF v_fact.orden_compra_id IS DISTINCT FROM v_o.id THEN
        RAISE EXCEPTION 'Factura no corresponde a la orden de compra';
      END IF;
    END IF;
    IF EXISTS(SELECT 1 FROM public.movimiento_detalles d WHERE d.movimiento_id=NEW.id
      AND (d.orden_compra_detalle_id IS NULL OR d.solicitud_detalle_id IS NOT NULL OR d.conteo_detalle_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'Cada producto comprado requiere orden_compra_detalle_id';
    END IF;
    FOR v_det IN SELECT DISTINCT orden_compra_detalle_id AS id FROM public.movimiento_detalles
       WHERE movimiento_id=NEW.id LOOP
      SELECT od.orden_compra_id,od.producto_id,od.cantidad
        INTO v_obj FROM public.orden_compra_detalles od WHERE od.id=v_det.id;
      IF NOT FOUND OR v_obj.orden_compra_id<>v_o.id OR
        EXISTS(SELECT 1 FROM public.movimiento_detalles d WHERE d.movimiento_id=NEW.id
           AND d.orden_compra_detalle_id=v_det.id AND d.producto_id<>v_obj.producto_id) THEN
        RAISE EXCEPTION 'Recepcion no corresponde a renglon de orden %',v_det.id;
      END IF;
      SELECT coalesce(sum(d.cantidad),0) INTO v_previo
       FROM public.movimientos m JOIN public.movimiento_detalles d ON d.movimiento_id=m.id
       WHERE m.estado='CONFIRMADO' AND d.orden_compra_detalle_id=v_det.id;
      SELECT coalesce(sum(d.cantidad),0) INTO v_actual FROM public.movimiento_detalles d
       WHERE d.movimiento_id=NEW.id AND d.orden_compra_detalle_id=v_det.id;
      IF v_previo+v_actual>v_obj.cantidad THEN
        RAISE EXCEPTION 'Recepcion excede cantidad comprada: renglon %',v_det.id;
      END IF;
    END LOOP;
  ELSE
    IF EXISTS(SELECT 1 FROM public.movimiento_detalles d WHERE d.movimiento_id=NEW.id
      AND (d.solicitud_detalle_id IS NOT NULL OR d.orden_compra_detalle_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'Referencias a requisiciones/compras solo admitidas en el proceso correspondiente';
    END IF;
  END IF;

  IF NEW.tipo IN ('AJUSTE_ENTRADA','AJUSTE_SALIDA') THEN
    IF NEW.conteo_fisico_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.movimiento_detalles d WHERE d.movimiento_id=NEW.id
      AND d.conteo_detalle_id IS NULL
    ) THEN RAISE EXCEPTION 'Ajuste vinculado a conteo requiere vinculo en cada detalle'; END IF;
    IF EXISTS(SELECT 1 FROM public.movimiento_detalles d WHERE d.movimiento_id=NEW.id
      AND d.conteo_detalle_id IS NOT NULL AND
      (NEW.conteo_fisico_id IS NULL OR NOT EXISTS(
        SELECT 1 FROM public.conteo_detalles cd WHERE cd.id=d.conteo_detalle_id
        AND cd.conteo_id=NEW.conteo_fisico_id AND cd.producto_id=d.producto_id
        AND cd.ubicacion_id IS NOT DISTINCT FROM d.ubicacion_id
      ))) THEN RAISE EXCEPTION 'Ajuste no coincide con detalle de conteo'; END IF;
    IF NEW.conteo_fisico_id IS NOT NULL THEN
      FOR v_det IN SELECT DISTINCT conteo_detalle_id AS id FROM public.movimiento_detalles
         WHERE movimiento_id=NEW.id LOOP
        SELECT cd.diferencia AS cantidad INTO v_obj FROM public.conteo_detalles cd
         WHERE cd.id=v_det.id;
        IF v_obj.cantidad IS NULL OR
           (NEW.tipo='AJUSTE_ENTRADA' AND v_obj.cantidad<=0) OR
           (NEW.tipo='AJUSTE_SALIDA' AND v_obj.cantidad>=0) THEN
          RAISE EXCEPTION 'Signo de ajuste no coincide con diferencia de conteo %',v_det.id;
        END IF;
        SELECT coalesce(sum(d.cantidad),0) INTO v_previo
         FROM public.movimientos m JOIN public.movimiento_detalles d ON d.movimiento_id=m.id
         WHERE m.estado='CONFIRMADO' AND d.conteo_detalle_id=v_det.id;
        SELECT coalesce(sum(d.cantidad),0) INTO v_actual FROM public.movimiento_detalles d
         WHERE d.movimiento_id=NEW.id AND d.conteo_detalle_id=v_det.id;
        IF v_previo+v_actual>abs(v_obj.cantidad) THEN
          RAISE EXCEPTION 'Ajuste acumulado excede diferencia fisica: detalle %',v_det.id;
        END IF;
      END LOOP;
    END IF;
  ELSIF EXISTS(SELECT 1 FROM public.movimiento_detalles d WHERE d.movimiento_id=NEW.id
      AND d.conteo_detalle_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Detalle de conteo solo se admite en ajustes';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_f3_movimiento_validar_confirmacion
BEFORE UPDATE OF estado ON public.movimientos
FOR EACH ROW WHEN (NEW.estado='CONFIRMADO' AND OLD.estado='BORRADOR')
EXECUTE FUNCTION public.lwi_fase3_validar_confirmacion();

-- Actualizar estados agregados DESPUES de confirmar el movimiento fisico.
CREATE OR REPLACE FUNCTION public.lwi_fase3_actualizar_cumplimiento()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_pendiente BOOLEAN;
BEGIN
  IF NEW.tipo='SALIDA' AND NEW.origen='REQUISICION' AND NEW.solicitud_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.solicitud_detalles sd
      WHERE sd.solicitud_id=NEW.solicitud_id AND coalesce(sd.cantidad_autorizada,0) >
      (SELECT coalesce(sum(md.cantidad),0)
       FROM public.movimientos m JOIN public.movimiento_detalles md ON md.movimiento_id=m.id
       WHERE m.estado='CONFIRMADO' AND md.solicitud_detalle_id=sd.id)
    ) INTO v_pendiente;
    PERFORM set_config('lwi.fase3_solicitud_cambio','on',true);
    UPDATE public.solicitudes SET estado=CASE WHEN v_pendiente THEN 'PARCIAL' ELSE 'DESPACHADA' END
      WHERE id=NEW.solicitud_id;
    PERFORM set_config('lwi.fase3_solicitud_cambio','off',true);
  ELSIF NEW.tipo='ENTRADA' AND NEW.origen='COMPRA' AND NEW.orden_compra_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.orden_compra_detalles od
      WHERE od.orden_compra_id=NEW.orden_compra_id AND od.cantidad >
        (SELECT coalesce(sum(md.cantidad),0)
         FROM public.movimientos m JOIN public.movimiento_detalles md ON md.movimiento_id=m.id
         WHERE m.estado='CONFIRMADO' AND md.orden_compra_detalle_id=od.id)
    ) INTO v_pendiente;
    PERFORM set_config('lwi.fase3_orden_cambio','on',true);
    UPDATE public.ordenes_compra SET estado=CASE WHEN v_pendiente THEN 'PARCIAL' ELSE 'RECIBIDA' END
      WHERE id=NEW.orden_compra_id;
    PERFORM set_config('lwi.fase3_orden_cambio','off',true);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_f3_movimiento_actualizar_cumplimiento
AFTER UPDATE OF estado ON public.movimientos
FOR EACH ROW WHEN (NEW.estado='CONFIRMADO' AND OLD.estado='BORRADOR')
EXECUTE FUNCTION public.lwi_fase3_actualizar_cumplimiento();

-- CONSULTAS DE CONTROL: fuentes de verdad son MOVIMIENTOS CONFIRMADOS y LOTES.
CREATE OR REPLACE VIEW public.vw_f3_solicitudes_cumplimiento AS
SELECT s.id AS solicitud_id,s.numero,s.estado,s.proyecto_id,s.bodega_id,
 sd.id AS solicitud_detalle_id,sd.producto_id,sd.cantidad_solicitada,sd.cantidad_autorizada,
 coalesce((SELECT sum(d.cantidad) FROM public.movimiento_detalles d
   JOIN public.movimientos m ON m.id=d.movimiento_id
   WHERE d.solicitud_detalle_id=sd.id AND m.estado='CONFIRMADO'),0)::numeric(18,3) AS cantidad_despachada,
 (coalesce(sd.cantidad_autorizada,0)-coalesce((SELECT sum(d.cantidad)
   FROM public.movimiento_detalles d JOIN public.movimientos m ON m.id=d.movimiento_id
   WHERE d.solicitud_detalle_id=sd.id AND m.estado='CONFIRMADO'),0))::numeric(18,3) AS saldo_autorizado
FROM public.solicitudes s JOIN public.solicitud_detalles sd ON sd.solicitud_id=s.id;

CREATE OR REPLACE VIEW public.vw_f3_ordenes_recepcion AS
SELECT oc.id AS orden_compra_id,oc.numero,oc.estado,oc.proveedor_tercero_id,oc.moneda,
 od.id AS orden_compra_detalle_id,od.producto_id,od.cantidad AS cantidad_ordenada,
 od.precio_unitario,od.descuento_total,od.impuesto_total,
 coalesce((SELECT sum(d.cantidad) FROM public.movimiento_detalles d
   JOIN public.movimientos m ON m.id=d.movimiento_id
   WHERE d.orden_compra_detalle_id=od.id AND m.estado='CONFIRMADO'),0)::numeric(18,3) AS cantidad_recibida,
 (od.cantidad-coalesce((SELECT sum(d.cantidad) FROM public.movimiento_detalles d
   JOIN public.movimientos m ON m.id=d.movimiento_id
   WHERE d.orden_compra_detalle_id=od.id AND m.estado='CONFIRMADO'),0))::numeric(18,3) AS cantidad_pendiente,
 ((od.cantidad*od.precio_unitario)-od.descuento_total+od.impuesto_total)::numeric(26,6) AS subtotal_documentado
FROM public.ordenes_compra oc JOIN public.orden_compra_detalles od ON od.orden_compra_id=oc.id;

CREATE OR REPLACE VIEW public.vw_f3_diferencias_conteo AS
SELECT c.id AS conteo_id,c.numero,c.bodega_id,c.estado,c.fecha_conteo,
 cd.id AS conteo_detalle_id,cd.producto_id,cd.ubicacion_id,
 cd.cantidad_sistema,cd.cantidad_contada,cd.diferencia,
 CASE WHEN cd.diferencia>0 THEN 'SOBRANTE'
      WHEN cd.diferencia<0 THEN 'FALTANTE'
      WHEN cd.diferencia=0 THEN 'CONCILIADO' ELSE 'PENDIENTE' END AS resultado
FROM public.conteos_fisicos c JOIN public.conteo_detalles cd ON cd.conteo_id=c.id;

COMMENT ON FUNCTION public.lwi_fase3_decidir_solicitud(BIGINT,BIGINT,VARCHAR,TEXT)
 IS 'Decision digital autenticada por backend; almacenar usuario, fecha y motivo';
COMMENT ON FUNCTION public.lwi_fase3_abrir_conteo(BIGINT,BIGINT)
 IS 'Captura foto de existencias para contar; bloquea confirmaciones mientras esta EN_CONTEO';
COMMENT ON VIEW public.vw_f3_diferencias_conteo IS 'Las diferencias NO aplican ajustes de stock automaticamente';

COMMIT;
