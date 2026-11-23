-- Caller-supplied reference (their own record id) on audit records, plus indexes for listing and lookup by reference.
ALTER TABLE "AuditRecord" ADD COLUMN "reference" TEXT;
CREATE INDEX "AuditRecord_tenantId_createdAt_idx" ON "AuditRecord"("tenantId", "createdAt");
CREATE INDEX "AuditRecord_tenantId_reference_idx" ON "AuditRecord"("tenantId", "reference");
