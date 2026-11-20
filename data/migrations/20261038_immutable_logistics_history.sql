CREATE OR REPLACE FUNCTION prevent_logistics_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El historial logístico es inalterable; registra un movimiento de reversa para corregirlo.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stock_movements_immutable ON stock_movements;
CREATE TRIGGER stock_movements_immutable BEFORE UPDATE OR DELETE ON stock_movements
FOR EACH ROW EXECUTE FUNCTION prevent_logistics_history_mutation();
DROP TRIGGER IF EXISTS storage_movements_immutable ON storage_movements;
CREATE TRIGGER storage_movements_immutable BEFORE UPDATE OR DELETE ON storage_movements
FOR EACH ROW EXECUTE FUNCTION prevent_logistics_history_mutation();
DROP TRIGGER IF EXISTS logistics_return_events_immutable ON logistics_return_events;
CREATE TRIGGER logistics_return_events_immutable BEFORE UPDATE OR DELETE ON logistics_return_events
FOR EACH ROW EXECUTE FUNCTION prevent_logistics_history_mutation();
DROP TRIGGER IF EXISTS inventory_transfer_events_immutable ON inventory_transfer_events;
CREATE TRIGGER inventory_transfer_events_immutable BEFORE UPDATE OR DELETE ON inventory_transfer_events
FOR EACH ROW EXECUTE FUNCTION prevent_logistics_history_mutation();
DROP TRIGGER IF EXISTS tms_trip_events_immutable ON tms_trip_events;
CREATE TRIGGER tms_trip_events_immutable BEFORE UPDATE OR DELETE ON tms_trip_events
FOR EACH ROW EXECUTE FUNCTION prevent_logistics_history_mutation();
