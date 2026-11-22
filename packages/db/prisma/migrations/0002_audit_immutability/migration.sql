-- Audit records are immutable. UPDATE is never allowed. DELETE is allowed only inside a transaction that sets
-- briesa.retention = 'on', which only the retention job and tenant erasure do (see PrismaStore.asRetention).
CREATE OR REPLACE FUNCTION briesa_audit_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'AuditRecord rows are immutable' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' AND coalesce(current_setting('briesa.retention', true), '') <> 'on' THEN
    RAISE EXCEPTION 'AuditRecord rows can only be deleted by the retention job' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditRecord_immutable"
  BEFORE UPDATE OR DELETE ON "AuditRecord"
  FOR EACH ROW EXECUTE FUNCTION briesa_audit_guard();
