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



-- ============================================================================================
-- LWI | FASE 4 | RBAC, configuracion y auditoria
-- ============================================================================================

BEGIN;

-- VERIFICACION DE DEPENDENCIAS
DO $$ BEGIN
  IF to_regclass('public.auditoria_eventos') IS NULL
    OR to_regclass('public.permisos') IS NULL
    OR to_regclass('public.configuracion_sistema') IS NULL THEN
      RAISE EXCEPTION 'Ejecute primero 01_crear_tablas_fase4.sql';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.lwi_f4_tocar_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at:=now(); RETURN NEW; END $$;

CREATE TRIGGER trg_f4_config_fecha BEFORE UPDATE ON public.configuracion_sistema
 FOR EACH ROW EXECUTE FUNCTION public.lwi_f4_tocar_updated_at();
CREATE TRIGGER trg_f4_rol_permisos_fecha BEFORE UPDATE ON public.rol_permisos
 FOR EACH ROW EXECUTE FUNCTION public.lwi_f4_tocar_updated_at();
CREATE TRIGGER trg_f4_politicas_fecha BEFORE UPDATE ON public.politicas_stock_bodega
 FOR EACH ROW EXECUTE FUNCTION public.lwi_f4_tocar_updated_at();

-- Configuracion: tipos y dominios conocidos. Nuevas claves requieren definir validaciones en API.
CREATE OR REPLACE FUNCTION public.lwi_f4_validar_configuracion()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_int integer;
BEGIN
  IF NEW.clave='DIAS_ALERTA_VENCIMIENTO' THEN
    IF jsonb_typeof(NEW.valor)<>'number' OR (NEW.valor #>> '{}') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'DIAS_ALERTA_VENCIMIENTO requiere entero 0..365';
    END IF;
    v_int := (NEW.valor #>> '{}')::integer;
    IF v_int NOT BETWEEN 0 AND 365 THEN
      RAISE EXCEPTION 'DIAS_ALERTA_VENCIMIENTO fuera del rango 0..365';
    END IF;
  ELSIF NEW.clave='HABILITAR_ALERTAS_INVENTARIO' THEN
    IF jsonb_typeof(NEW.valor)<>'boolean' THEN
      RAISE EXCEPTION 'HABILITAR_ALERTAS_INVENTARIO debe ser boolean';
    END IF;
  ELSIF NEW.clave='IDIOMA_PREDETERMINADO' THEN
    IF jsonb_typeof(NEW.valor)<>'string' OR (NEW.valor #>> '{}') NOT IN ('es','en','fr') THEN
      RAISE EXCEPTION 'Idioma permitido: es, en, fr';
    END IF;
  ELSIF NEW.clave='ZONA_HORARIA' THEN
    IF jsonb_typeof(NEW.valor)<>'string' OR NOT EXISTS(
      SELECT 1 FROM pg_timezone_names WHERE name=(NEW.valor #>> '{}')
    ) THEN
      RAISE EXCEPTION 'ZONA_HORARIA desconocida';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_f4_config_validar BEFORE INSERT OR UPDATE ON public.configuracion_sistema
 FOR EACH ROW EXECUTE FUNCTION public.lwi_f4_validar_configuracion();

-- Función de consulta RBAC; se debe invocar desde la API después de verificar el JWT.
-- NO concede por sí sola privilegios PostgreSQL ni autentica al usuario que llama.
CREATE OR REPLACE FUNCTION public.lwi_f4_usuario_tiene_permiso(
  p_usuario_id BIGINT,p_clave VARCHAR)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.usuarios u
   JOIN public.rol r ON r.id=u.rol_id AND r.activo
   JOIN public.rol_permisos rp ON rp.rol_id=r.id AND rp.activo
   JOIN public.permisos p ON p.id=rp.permiso_id AND p.activo
   WHERE u.id=p_usuario_id AND u.activo AND p.clave=p_clave
 );
$$;

-- Bitacora inmutable. Conservar sólo campos no secretos.
-- SECURITY DEFINER permite registrar sin otorgar INSERT directo a la API.
-- El propietario de la función debe ser un rol confiable de administración.
CREATE OR REPLACE FUNCTION public.lwi_f4_auditar_cambio()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_actor bigint;
  v_origen text;
BEGIN
  IF TG_OP<>'INSERT' THEN v_old:=to_jsonb(OLD); END IF;
  IF TG_OP<>'DELETE' THEN v_new:=to_jsonb(NEW); END IF;

  -- No guardar secretos (ni antes ni después): contraseña, tokens, claves de objetos.
  IF v_old IS NOT NULL THEN
    v_old:=v_old-'contraseña'-'password_hash'-'passwordHash'-'clave_almacenamiento'-'sha256';
  END IF;
  IF v_new IS NOT NULL THEN
    v_new:=v_new-'contraseña'-'password_hash'-'passwordHash'-'clave_almacenamiento'-'sha256';
  END IF;
  IF TG_TABLE_NAME='usuarios' AND TG_OP='UPDATE' THEN
    v_new:=jsonb_set(v_new,'{credencial_modificada}',
      to_jsonb(OLD."contraseña" IS DISTINCT FROM NEW."contraseña"),true);
  END IF;
  IF v_old IS NOT DISTINCT FROM v_new THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_TABLE_NAME='rol_permisos' THEN
    v_key:=concat_ws(':',coalesce(v_new->>'rol_id',v_old->>'rol_id'),
                        coalesce(v_new->>'permiso_id',v_old->>'permiso_id'));
  ELSIF TG_TABLE_NAME='politicas_stock_bodega' THEN
    v_key:=concat_ws(':',coalesce(v_new->>'producto_id',v_old->>'producto_id'),
                        coalesce(v_new->>'bodega_id',v_old->>'bodega_id'));
  ELSIF TG_TABLE_NAME='configuracion_sistema' THEN
    v_key:=coalesce(v_new->>'clave',v_old->>'clave');
  ELSE
    v_key:=coalesce(v_new->>'id',v_old->>'id');
  END IF;
  v_actor:=nullif(current_setting('lwi.actor_usuario_id',true),'')::bigint;
  v_origen:=coalesce(nullif(current_setting('lwi.origen',true),''),'SQL');
  INSERT INTO public.auditoria_eventos(
    usuario_actor_id,actor_bd,origen,tabla,entidad_clave,accion,datos_antes,datos_despues
  ) VALUES(v_actor,session_user,left(v_origen,60),TG_TABLE_NAME,left(v_key,180),TG_OP,v_old,v_new);
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.lwi_f4_auditoria_inmutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'La bitacora de auditoria no admite UPDATE ni DELETE'; END $$;
CREATE TRIGGER trg_f4_auditoria_inmutable BEFORE UPDATE OR DELETE ON public.auditoria_eventos
 FOR EACH ROW EXECUTE FUNCTION public.lwi_f4_auditoria_inmutable();

-- Auditoría sobre cambios relevantes, sin reescribir historial previo.
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
  'rol','usuarios','permisos','rol_permisos','configuracion_sistema',
  'politicas_stock_bodega','alertas_inventario',
  'productos','categorias','bodegas',
  'movimientos','movimiento_detalles','lotes','consumos_lote','devoluciones_lote',
  'solicitudes','solicitud_detalles','aprobaciones',
  'ordenes_compra','orden_compra_detalles','facturas_compra',
  'conteos_fisicos','conteo_detalles','archivos_adjuntos'
 ] LOOP
   EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
       || 'FOR EACH ROW EXECUTE FUNCTION public.lwi_f4_auditar_cambio()',
       'trg_f4_auditar_'||t,t);
 END LOOP;
END $$;

-- Catálogo de permisos funcionales. Estos nombres sirven para el backend.
INSERT INTO public.permisos(clave,modulo,descripcion) VALUES
 ('usuarios.ver','usuarios','Consultar cuentas y roles'),
 ('usuarios.gestionar','usuarios','Crear, editar y desactivar usuarios'),
 ('permisos.gestionar','seguridad','Administrar permisos de roles'),
 ('catalogos.ver','catalogos','Consultar catálogos'),
 ('catalogos.gestionar','catalogos','Crear o editar productos y catálogos'),
 ('proveedores.ver','terceros','Consultar proveedores y donantes'),
 ('proveedores.gestionar','terceros','Administrar terceros y sus roles comerciales'),
 ('inventario.ver','inventario','Consultar existencias y lotes'),
 ('inventario.movimientos.crear','inventario','Crear borradores de movimientos'),
 ('inventario.movimientos.confirmar','inventario','Confirmar movimientos físicos'),
 ('inventario.valoracion.ver','finanzas','Consultar costos y valoración PEPS'),
 ('solicitudes.crear','solicitudes','Crear requisiciones'),
 ('solicitudes.aprobar','solicitudes','Aprobar y rechazar requisiciones'),
 ('compras.ver','compras','Consultar órdenes y recepciones'),
 ('compras.gestionar','compras','Crear y emitir órdenes de compra'),
 ('conteos.gestionar','conteos','Crear, ejecutar y cerrar conteos físicos'),
 ('ajustes.confirmar','inventario','Confirmar ajustes de inventario'),
 ('reportes.operativos.ver','reportes','Consultar Kardex y reportes de operaciones'),
 ('reportes.financieros.ver','reportes','Consultar informes valorizados'),
 ('reportes.exportar','reportes','Exportar reportes autorizados'),
 ('alertas.ver','alertas','Consultar alertas'),
 ('alertas.gestionar','alertas','Actualizar alertas y políticas por bodega'),
 ('auditoria.ver','auditoria','Consultar el registro de auditoría'),
 ('configuracion.gestionar','configuracion','Modificar opciones generales y notificaciones'),
 ('evidencias.gestionar','documentos','Registrar evidencias y consultar su referencia')
ON CONFLICT (clave) DO NOTHING;

-- Política conservadora: solo Administrador recibe permisos inicialmente.
-- Los roles restantes se configuran según matriz aprobada por LWI.
INSERT INTO public.rol_permisos(rol_id,permiso_id)
SELECT r.id,p.id FROM public.rol r CROSS JOIN public.permisos p
WHERE r.nombre='Administrador'
ON CONFLICT (rol_id,permiso_id) DO NOTHING;

-- Defaults propuestos, NO decisiones operativas aprobadas por LWI.
INSERT INTO public.configuracion_sistema(clave,categoria,valor,descripcion) VALUES
 ('DIAS_ALERTA_VENCIMIENTO','ALERTAS',to_jsonb(30),'Umbral sugerido en días; requiere validación con LWI'),
 ('HABILITAR_ALERTAS_INVENTARIO','ALERTAS','true'::jsonb,'Activa la evaluación de alertas'),
 ('IDIOMA_PREDETERMINADO','INTERFAZ',to_jsonb('es'::text),'Idioma inicial de la aplicación'),
 ('ZONA_HORARIA','GENERAL',to_jsonb('America/Guatemala'::text),'Zona horaria institucional')
ON CONFLICT (clave) DO NOTHING;

COMMENT ON FUNCTION public.lwi_f4_usuario_tiene_permiso(BIGINT,VARCHAR)
 IS 'Verifica autorización funcional en tablas RBAC; la API debe usar actor JWT autenticado';
COMMENT ON FUNCTION public.lwi_f4_auditar_cambio()
 IS 'Auditoría desde instalación F4, con exclusión de secretos. actor GUC = contexto no autenticado por PostgreSQL';

-- Sólo ejecutan las funciones mediante triggers o política controlada.
REVOKE ALL ON FUNCTION public.lwi_f4_auditar_cambio() FROM PUBLIC;
COMMIT;


-- Reportes en tiempo real; solo lecturas y sincronización de alertas
BEGIN;

-- Candidatas para cada ejecución. Si el producto nunca tuvo stock, crear
-- politica_stock_bodega para que su stock cero pueda generar alerta.
CREATE OR REPLACE VIEW public.vw_f4_alertas_candidatas AS
WITH parametros AS (
  SELECT
    coalesce((SELECT (valor #>> '{}')::integer FROM public.configuracion_sistema
              WHERE clave='DIAS_ALERTA_VENCIMIENTO'),30) AS dias,
    coalesce((SELECT (valor #>> '{}')::boolean FROM public.configuracion_sistema
              WHERE clave='HABILITAR_ALERTAS_INVENTARIO'),true) AS habilitadas
), pares AS (
  SELECT producto_id,bodega_id FROM public.lotes
  UNION
  SELECT producto_id,bodega_id FROM public.politicas_stock_bodega
), existencias AS (
  SELECT producto_id,bodega_id,sum(cantidad_disponible)::numeric(24,3) AS cantidad
  FROM public.lotes GROUP BY producto_id,bodega_id
)
SELECT 'STOCK_BAJO'::varchar(25) AS tipo,p.id AS producto_id,b.id AS bodega_id,
       NULL::bigint AS lote_id,
       jsonb_build_object('cantidad_disponible',coalesce(e.cantidad,0),
                          'stock_minimo',coalesce(pol.stock_minimo,p.stock_minimo)) AS contexto
FROM pares q
JOIN public.productos p ON p.id=q.producto_id AND p.activo
JOIN public.bodegas b ON b.id=q.bodega_id AND b.activo
LEFT JOIN public.politicas_stock_bodega pol ON pol.producto_id=p.id AND pol.bodega_id=b.id
LEFT JOIN existencias e ON e.producto_id=p.id AND e.bodega_id=b.id
CROSS JOIN parametros prm
WHERE prm.habilitadas
  AND coalesce(pol.activo,true) AND coalesce(pol.alertas_habilitadas,true)
  AND coalesce(pol.stock_minimo,p.stock_minimo,0)>0
  AND coalesce(e.cantidad,0)<coalesce(pol.stock_minimo,p.stock_minimo)
UNION ALL
SELECT (CASE WHEN l.fecha_vencimiento<CURRENT_DATE THEN 'VENCIDO'
             ELSE 'VENCIMIENTO_PROXIMO' END)::varchar(25),
       l.producto_id,l.bodega_id,l.id,
       jsonb_build_object('cantidad_disponible',l.cantidad_disponible,
                          'fecha_vencimiento',l.fecha_vencimiento,
                          'dias_restantes',l.fecha_vencimiento-CURRENT_DATE)
FROM public.lotes l
JOIN public.productos p ON p.id=l.producto_id AND p.activo
JOIN public.bodegas b ON b.id=l.bodega_id AND b.activo
LEFT JOIN public.politicas_stock_bodega pol
  ON pol.producto_id=l.producto_id AND pol.bodega_id=l.bodega_id
CROSS JOIN parametros prm
WHERE prm.habilitadas AND coalesce(pol.activo,true)
  AND coalesce(pol.alertas_habilitadas,true)
  AND l.cantidad_disponible>0 AND l.fecha_vencimiento IS NOT NULL
  AND l.fecha_vencimiento<=CURRENT_DATE+prm.dias;

-- Sincroniza el historial de alertas con el estado actual (sin borrar registros).
-- Invocar desde tarea programada o después de confirmación en el backend.
CREATE OR REPLACE FUNCTION public.lwi_f4_sincronizar_alertas()
RETURNS TABLE (resueltas integer,creadas integer)
LANGUAGE plpgsql AS $$
DECLARE v_resueltas integer:=0; v_creadas integer:=0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('LWI_F4_ALERTAS'),hashtext('SINCRONIZAR'));
  UPDATE public.alertas_inventario a SET estado='RESUELTA',resuelta_at=now()
  WHERE a.estado='ACTIVA' AND NOT EXISTS (
    SELECT 1 FROM public.vw_f4_alertas_candidatas c
    WHERE c.tipo=a.tipo AND c.producto_id=a.producto_id
      AND c.bodega_id=a.bodega_id AND c.lote_id IS NOT DISTINCT FROM a.lote_id
  );
  GET DIAGNOSTICS v_resueltas=ROW_COUNT;

  INSERT INTO public.alertas_inventario(tipo,producto_id,bodega_id,lote_id,contexto)
  SELECT c.tipo,c.producto_id,c.bodega_id,c.lote_id,c.contexto
  FROM public.vw_f4_alertas_candidatas c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.alertas_inventario a WHERE a.estado='ACTIVA'
      AND a.tipo=c.tipo AND a.producto_id=c.producto_id
      AND a.bodega_id=c.bodega_id AND a.lote_id IS NOT DISTINCT FROM c.lote_id
  ) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_creadas=ROW_COUNT;

  resueltas:=v_resueltas; creadas:=v_creadas;
  RETURN NEXT;
END $$;

CREATE OR REPLACE VIEW public.vw_f4_alertas_activas AS
SELECT a.id,a.tipo,a.producto_id,p.codigo AS codigo_producto,p.nombre AS producto,
       a.bodega_id,b.nombre AS bodega,a.lote_id,a.contexto,a.detectada_at
FROM public.alertas_inventario a
JOIN public.productos p ON p.id=a.producto_id
JOIN public.bodegas b ON b.id=a.bodega_id
WHERE a.estado='ACTIVA';

-- KARDEX: detalle POR LOTE. No se deduce la ubicación a partir de la línea
-- de salida (que puede ser NULL y consumir distintas ubicaciones).
CREATE OR REPLACE VIEW public.vw_f4_kardex AS
WITH eventos AS (
  -- Cada entrada/ajuste positivo origina un lote físico.
  SELECT m.id AS movimiento_id,m.numero,m.fecha_operacion,m.confirmado_at,
    m.tipo,m.origen,m.confirmado_por_usuario_id,
    d.id AS detalle_id,l.id AS lote_id,l.producto_id,l.bodega_id,l.ubicacion_id,
    1::integer AS orden_evento,
    d.cantidad::numeric(24,3) AS cantidad_variacion,
    (d.cantidad*l.costo_unitario)::numeric(26,6) AS valor_variacion,
    l.costo_unitario
  FROM public.lotes l
  JOIN public.movimiento_detalles d ON d.id=l.entrada_detalle_id
  JOIN public.movimientos m ON m.id=d.movimiento_id
  WHERE m.estado='CONFIRMADO' AND m.tipo IN ('ENTRADA','AJUSTE_ENTRADA')
  UNION ALL
  -- Un despacho puede tener varios consumos por distintos lotes.
  SELECT m.id,m.numero,m.fecha_operacion,m.confirmado_at,m.tipo,m.origen,
    m.confirmado_por_usuario_id,d.id,l.id,l.producto_id,l.bodega_id,l.ubicacion_id,
    2,-c.cantidad,(-c.cantidad*c.costo_unitario)::numeric(26,6),c.costo_unitario
  FROM public.consumos_lote c
  JOIN public.lotes l ON l.id=c.lote_id
  JOIN public.movimiento_detalles d ON d.id=c.salida_detalle_id
  JOIN public.movimientos m ON m.id=d.movimiento_id
  WHERE m.estado='CONFIRMADO' AND m.tipo IN ('SALIDA','AJUSTE_SALIDA')
  UNION ALL
  -- La devolución recupera cantidad y costo del consumo histórico original.
  SELECT m.id,m.numero,m.fecha_operacion,m.confirmado_at,m.tipo,m.origen,
    m.confirmado_por_usuario_id,d.id,l.id,l.producto_id,l.bodega_id,l.ubicacion_id,
    3,dl.cantidad,(dl.cantidad*dl.costo_unitario)::numeric(26,6),dl.costo_unitario
  FROM public.devoluciones_lote dl
  JOIN public.consumos_lote c ON c.id=dl.consumo_lote_id
  JOIN public.lotes l ON l.id=c.lote_id
  JOIN public.movimiento_detalles d ON d.id=dl.devolucion_detalle_id
  JOIN public.movimientos m ON m.id=d.movimiento_id
  WHERE m.estado='CONFIRMADO' AND m.tipo='DEVOLUCION'
)
SELECT e.*,p.codigo AS codigo_producto,p.nombre AS producto,
  sum(e.cantidad_variacion) OVER (
    PARTITION BY e.producto_id,e.bodega_id
    ORDER BY e.fecha_operacion,e.confirmado_at,e.movimiento_id,e.detalle_id,e.lote_id,e.orden_evento
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )::numeric(26,3) AS saldo_acumulado_producto_bodega,
  sum(e.valor_variacion) OVER (
    PARTITION BY e.producto_id,e.bodega_id
    ORDER BY e.fecha_operacion,e.confirmado_at,e.movimiento_id,e.detalle_id,e.lote_id,e.orden_evento
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )::numeric(30,6) AS valor_acumulado_producto_bodega
FROM eventos e JOIN public.productos p ON p.id=e.producto_id;

CREATE OR REPLACE VIEW public.vw_f4_valorizacion_peps AS
SELECT l.producto_id,p.codigo AS codigo_producto,p.nombre AS producto,
       p.categoria_id,l.bodega_id,b.nombre AS bodega,
       sum(l.cantidad_disponible)::numeric(26,3) AS cantidad_disponible,
       sum(l.cantidad_disponible*l.costo_unitario)::numeric(30,6) AS valor_peps,
       count(*) FILTER (WHERE l.cantidad_disponible>0) AS lotes_con_saldo,
       min(l.fecha_recepcion) FILTER (WHERE l.cantidad_disponible>0) AS primera_recepcion_disponible
FROM public.lotes l
JOIN public.productos p ON p.id=l.producto_id
JOIN public.bodegas b ON b.id=l.bodega_id
GROUP BY l.producto_id,p.codigo,p.nombre,p.categoria_id,l.bodega_id,b.nombre;

-- Consumo por mes/COA/producto: no mezcla unidades de productos diferentes.
CREATE OR REPLACE VIEW public.vw_f4_consumo_mensual_coa AS
SELECT date_trunc('month',m.fecha_operacion::timestamp)::date AS mes,
       coalesce(m.clase_coa_id,p.clase_coa_id) AS clase_coa_id,
       p.id AS producto_id,p.codigo AS codigo_producto,p.nombre AS producto,
       m.bodega_id,
       sum(c.cantidad)::numeric(26,3) AS cantidad_consumida,
       sum(c.cantidad*c.costo_unitario)::numeric(30,6) AS costo_consumido
FROM public.consumos_lote c
JOIN public.movimiento_detalles d ON d.id=c.salida_detalle_id
JOIN public.movimientos m ON m.id=d.movimiento_id
JOIN public.productos p ON p.id=d.producto_id
WHERE m.estado='CONFIRMADO' AND m.tipo='SALIDA'
GROUP BY date_trunc('month',m.fecha_operacion::timestamp)::date,
         coalesce(m.clase_coa_id,p.clase_coa_id),p.id,p.codigo,p.nombre,m.bodega_id;

-- Dashboard: agregados independientes para impedir multiplicar costos por JOIN.
CREATE OR REPLACE VIEW public.vw_f4_dashboard_resumen AS
SELECT
 (SELECT count(*) FROM public.productos WHERE activo) AS productos_activos,
 (SELECT count(DISTINCT producto_id) FROM public.lotes WHERE cantidad_disponible>0) AS productos_con_existencias,
 (SELECT count(*) FROM public.bodegas WHERE activo) AS bodegas_activas,
 (SELECT coalesce(sum(cantidad_disponible*costo_unitario),0)::numeric(30,6)
    FROM public.lotes) AS valor_inventario_peps,
 (SELECT count(*) FROM public.vw_f4_alertas_candidatas WHERE tipo='STOCK_BAJO') AS alertas_stock_bajo_actuales,
 (SELECT count(*) FROM public.vw_f4_alertas_candidatas WHERE tipo='VENCIMIENTO_PROXIMO') AS lotes_por_vencer,
 (SELECT count(*) FROM public.vw_f4_alertas_candidatas WHERE tipo='VENCIDO') AS lotes_vencidos,
 (SELECT count(*) FROM public.movimientos WHERE estado='CONFIRMADO'
    AND fecha_operacion=CURRENT_DATE) AS movimientos_confirmados_hoy,
 (SELECT count(*) FROM public.movimientos WHERE estado='CONFIRMADO' AND tipo='ENTRADA'
    AND fecha_operacion>=date_trunc('month',CURRENT_DATE)::date
    AND fecha_operacion<CURRENT_DATE+1) AS entradas_confirmadas_mes,
 (SELECT count(*) FROM public.movimientos WHERE estado='CONFIRMADO' AND tipo='SALIDA'
    AND fecha_operacion>=date_trunc('month',CURRENT_DATE)::date
    AND fecha_operacion<CURRENT_DATE+1) AS salidas_confirmadas_mes,
 (SELECT count(*) FROM public.solicitudes WHERE estado='PENDIENTE') AS solicitudes_pendientes,
 (SELECT count(*) FROM public.ordenes_compra WHERE estado IN ('EMITIDA','PARCIAL')) AS ordenes_compra_abiertas;

CREATE OR REPLACE VIEW public.vw_f4_dashboard_categorias AS
WITH stock_producto AS (
 SELECT producto_id,
   sum(cantidad_disponible)::numeric(26,3) AS cantidad,
   sum(cantidad_disponible*costo_unitario)::numeric(30,6) AS valor
 FROM public.lotes GROUP BY producto_id
)
SELECT c.id AS categoria_id,c.codigo AS codigo_categoria,c.nombre AS categoria,
  count(p.id) FILTER (WHERE p.activo) AS productos_activos,
  count(p.id) FILTER (WHERE p.activo AND coalesce(s.cantidad,0)>0) AS productos_con_stock,
  coalesce(sum(s.valor) FILTER (WHERE p.activo),0)::numeric(30,6) AS valor_peps_categoria
FROM public.categorias c
LEFT JOIN public.productos p ON p.categoria_id=c.id
LEFT JOIN stock_producto s ON s.producto_id=p.id
GROUP BY c.id,c.codigo,c.nombre;

CREATE OR REPLACE VIEW public.vw_f4_dashboard_movimientos_recientes AS
SELECT m.id AS movimiento_id,m.numero,m.tipo,m.origen,m.fecha_operacion,m.confirmado_at,
       m.bodega_id,m.confirmado_por_usuario_id,
       count(d.id) AS renglones,
       count(DISTINCT d.producto_id) AS productos_distintos
FROM public.movimientos m
JOIN public.movimiento_detalles d ON d.movimiento_id=m.id
WHERE m.estado='CONFIRMADO'
GROUP BY m.id,m.numero,m.tipo,m.origen,m.fecha_operacion,m.confirmado_at,
         m.bodega_id,m.confirmado_por_usuario_id;

COMMENT ON VIEW public.vw_f4_kardex IS 'Kardex por lote y saldo acumulado de producto+bodega; ordenar por fecha_operacion, confirmado_at, movimiento_id, detalle_id, lote_id';
COMMENT ON VIEW public.vw_f4_valorizacion_peps IS 'Valor actual por capas PEPS; costo por lote, sin sumar unidades heterogéneas en el dashboard';
COMMENT ON VIEW public.vw_f4_dashboard_resumen IS 'Indicadores vivos, no materializados. El valor requiere costos históricos fiables y GTQ homogéneo';
COMMENT ON FUNCTION public.lwi_f4_sincronizar_alertas() IS 'Cerrar y crear alertas derivadas; requiere programador o llamada explícita desde API';
COMMIT;
