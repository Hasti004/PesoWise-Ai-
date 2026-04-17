-- Function: Enforce organization non-null rules and org-scoped uniqueness.

ALTER TABLE public.profiles ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.expenses ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.expense_line_items ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.attachments ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.expense_categories ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.locations ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.engineer_locations ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.money_assignments ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.money_return_requests ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.locations DROP CONSTRAINT IF EXISTS locations_name_key;
ALTER TABLE public.locations ADD CONSTRAINT locations_name_org_unique UNIQUE (name, organization_id);

ALTER TABLE public.expense_categories DROP CONSTRAINT IF EXISTS expense_categories_name_key;
ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_name_org_unique UNIQUE (name, organization_id);

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_transaction_number_key;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_transaction_number_org_unique UNIQUE (transaction_number, organization_id);

ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_key_key;
ALTER TABLE public.settings ADD CONSTRAINT settings_key_org_unique UNIQUE (key, organization_id);

CREATE INDEX idx_profiles_organization_id ON public.profiles(organization_id);
CREATE INDEX idx_expenses_organization_id ON public.expenses(organization_id);
CREATE INDEX idx_expense_line_items_organization_id ON public.expense_line_items(organization_id);
CREATE INDEX idx_attachments_organization_id ON public.attachments(organization_id);
CREATE INDEX idx_audit_logs_organization_id ON public.audit_logs(organization_id);
CREATE INDEX idx_org_memberships_org ON public.organization_memberships(organization_id);
CREATE INDEX idx_org_memberships_user ON public.organization_memberships(user_id);
