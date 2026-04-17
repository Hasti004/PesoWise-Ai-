-- Repair: expense_form_field_templates (and related) missing → PostgREST
-- "Could not find the table ... in the schema cache"
-- Idempotent: safe if 20250130000004_create_expense_form_fields.sql already applied.

CREATE TABLE IF NOT EXISTS public.expense_form_field_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'textarea', 'select', 'checkbox')),
  required BOOLEAN DEFAULT false,
  default_value TEXT,
  placeholder TEXT,
  help_text TEXT,
  validation_rules JSONB,
  options JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_field_templates_org ON public.expense_form_field_templates(organization_id);

CREATE TABLE IF NOT EXISTS public.expense_category_form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES public.expense_form_field_templates(id) ON DELETE CASCADE NOT NULL,
  required BOOLEAN,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_category_form_fields_category ON public.expense_category_form_fields(category_id);
CREATE INDEX IF NOT EXISTS idx_category_form_fields_template ON public.expense_category_form_fields(template_id);
CREATE INDEX IF NOT EXISTS idx_category_form_fields_org ON public.expense_category_form_fields(organization_id);

CREATE TABLE IF NOT EXISTS public.expense_form_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES public.expense_form_field_templates(id) ON DELETE CASCADE NOT NULL,
  field_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(expense_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_form_field_values_expense ON public.expense_form_field_values(expense_id);
CREATE INDEX IF NOT EXISTS idx_form_field_values_template ON public.expense_form_field_values(template_id);
CREATE INDEX IF NOT EXISTS idx_form_field_values_org ON public.expense_form_field_values(organization_id);

ALTER TABLE public.expense_form_field_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_category_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_form_field_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view form field templates in their organization" ON public.expense_form_field_templates;
CREATE POLICY "Admins can view form field templates in their organization"
  ON public.expense_form_field_templates FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_memberships
      WHERE user_id = auth.uid() AND is_active = true AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can create form field templates in their organization" ON public.expense_form_field_templates;
CREATE POLICY "Admins can create form field templates in their organization"
  ON public.expense_form_field_templates FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_memberships
      WHERE user_id = auth.uid() AND is_active = true AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update form field templates in their organization" ON public.expense_form_field_templates;
CREATE POLICY "Admins can update form field templates in their organization"
  ON public.expense_form_field_templates FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_memberships
      WHERE user_id = auth.uid() AND is_active = true AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete form field templates in their organization" ON public.expense_form_field_templates;
CREATE POLICY "Admins can delete form field templates in their organization"
  ON public.expense_form_field_templates FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_memberships
      WHERE user_id = auth.uid() AND is_active = true AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can view category form field assignments in their organization" ON public.expense_category_form_fields;
CREATE POLICY "Admins can view category form field assignments in their organization"
  ON public.expense_category_form_fields FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_memberships
      WHERE user_id = auth.uid() AND is_active = true AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can create category form field assignments in their organization" ON public.expense_category_form_fields;
CREATE POLICY "Admins can create category form field assignments in their organization"
  ON public.expense_category_form_fields FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_memberships
      WHERE user_id = auth.uid() AND is_active = true AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update category form field assignments in their organization" ON public.expense_category_form_fields;
CREATE POLICY "Admins can update category form field assignments in their organization"
  ON public.expense_category_form_fields FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_memberships
      WHERE user_id = auth.uid() AND is_active = true AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete category form field assignments in their organization" ON public.expense_category_form_fields;
CREATE POLICY "Admins can delete category form field assignments in their organization"
  ON public.expense_category_form_fields FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_memberships
      WHERE user_id = auth.uid() AND is_active = true AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can view form field values for their expenses" ON public.expense_form_field_values;
CREATE POLICY "Users can view form field values for their expenses"
  ON public.expense_form_field_values FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_memberships
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND (
      expense_id IN (
        SELECT id FROM public.expenses
        WHERE user_id = auth.uid()
        OR assigned_engineer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.organization_memberships
          WHERE user_id = auth.uid()
            AND organization_id = expenses.organization_id
            AND role = 'admin'
            AND is_active = true
        )
      )
    )
  );

DROP POLICY IF EXISTS "Users can create form field values for their expenses" ON public.expense_form_field_values;
CREATE POLICY "Users can create form field values for their expenses"
  ON public.expense_form_field_values FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_memberships
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND expense_id IN (
      SELECT id FROM public.expenses WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update form field values for their expenses" ON public.expense_form_field_values;
CREATE POLICY "Users can update form field values for their expenses"
  ON public.expense_form_field_values FOR UPDATE
  USING (
    expense_id IN (
      SELECT id FROM public.expenses
      WHERE user_id = auth.uid()
        AND status IN ('draft', 'submitted', 'rejected')
    )
  );

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_form_field_templates_updated_at ON public.expense_form_field_templates;
CREATE TRIGGER update_form_field_templates_updated_at
  BEFORE UPDATE ON public.expense_form_field_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_form_field_values_updated_at ON public.expense_form_field_values;
CREATE TRIGGER update_form_field_values_updated_at
  BEFORE UPDATE ON public.expense_form_field_values
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

GRANT ALL ON public.expense_form_field_templates TO authenticated;
GRANT ALL ON public.expense_form_field_templates TO service_role;
GRANT ALL ON public.expense_category_form_fields TO authenticated;
GRANT ALL ON public.expense_category_form_fields TO service_role;
GRANT ALL ON public.expense_form_field_values TO authenticated;
GRANT ALL ON public.expense_form_field_values TO service_role;

-- Ask PostgREST to reload exposed schema (local / self-hosted friendly)
NOTIFY pgrst, 'reload schema';
