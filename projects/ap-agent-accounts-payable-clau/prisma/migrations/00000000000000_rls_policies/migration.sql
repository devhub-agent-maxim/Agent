-- Row Level Security policies for multi-tenant isolation.
-- Run AFTER Prisma creates the tables (prisma migrate dev).
-- The app must SET app.current_tenant = '<tenant_id>' on every connection.

ALTER TABLE tenants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_codes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log        ENABLE ROW LEVEL SECURITY;

-- Tenant table: can only see own row
CREATE POLICY tenant_isolation ON tenants
  USING (id = current_setting('app.current_tenant', true));

-- All other tables: tenant_id must match session setting
CREATE POLICY vendor_isolation ON vendors
  USING (tenant_id = current_setting('app.current_tenant', true));

CREATE POLICY gl_code_isolation ON gl_codes
  USING (tenant_id = current_setting('app.current_tenant', true));

CREATE POLICY po_isolation ON purchase_orders
  USING (tenant_id = current_setting('app.current_tenant', true));

CREATE POLICY invoice_isolation ON invoices
  USING (tenant_id = current_setting('app.current_tenant', true));

CREATE POLICY line_item_isolation ON line_items
  USING (tenant_id = current_setting('app.current_tenant', true));

CREATE POLICY approval_rule_isolation ON approval_rules
  USING (tenant_id = current_setting('app.current_tenant', true));

CREATE POLICY audit_log_isolation ON audit_log
  USING (tenant_id = current_setting('app.current_tenant', true));
