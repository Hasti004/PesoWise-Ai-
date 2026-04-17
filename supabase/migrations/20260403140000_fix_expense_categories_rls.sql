-- Fix: "new row violates row-level security policy for table expense_categories"
-- Root cause: policies that only use has_role() (public.user_roles). Many org admins
-- exist only in organization_memberships, so INSERT/UPDATE/DELETE failed while the UI
-- still shows admin (from organizationCache / organization_memberships).

-- Drop policies this migration creates (safe re-run)
DROP POLICY IF EXISTS exp_cat_select_org_member ON public.expense_categories;
DROP POLICY IF EXISTS exp_cat_insert_org_admin ON public.expense_categories;
DROP POLICY IF EXISTS exp_cat_update_org_admin ON public.expense_categories;
DROP POLICY IF EXISTS exp_cat_delete_org_admin ON public.expense_categories;
DROP POLICY IF EXISTS exp_cat_read_active ON public.expense_categories;
DROP POLICY IF EXISTS exp_cat_insert_legacy_admin ON public.expense_categories;
DROP POLICY IF EXISTS exp_cat_update_legacy_admin ON public.expense_categories;
DROP POLICY IF EXISTS exp_cat_delete_legacy_admin ON public.expense_categories;

-- Drop all historical policy names (idempotent)
DROP POLICY IF EXISTS exp_cat_read ON public.expense_categories;
DROP POLICY IF EXISTS exp_cat_admin_ins ON public.expense_categories;
DROP POLICY IF EXISTS exp_cat_admin_upd ON public.expense_categories;
DROP POLICY IF EXISTS exp_cat_admin_del ON public.expense_categories;
DROP POLICY IF EXISTS exp_cat_admin_insert ON public.expense_categories;
DROP POLICY IF EXISTS exp_cat_admin_update ON public.expense_categories;
DROP POLICY IF EXISTS exp_cat_admin_delete ON public.expense_categories;
DROP POLICY IF EXISTS "Admins can insert expense_categories for restore" ON public.expense_categories;
DROP POLICY IF EXISTS "Admins can update expense_categories for restore" ON public.expense_categories;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expense_categories'
      AND column_name = 'organization_id'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'organization_memberships'
  ) THEN
    -- Multi-tenant: org members can list categories for their org (incl. inactive for admins via second policy)
    CREATE POLICY exp_cat_select_org_member ON public.expense_categories
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.organization_memberships om
          WHERE om.user_id = auth.uid()
            AND om.organization_id = expense_categories.organization_id
            AND om.is_active = true
        )
      );

    -- Admins (organization_memberships.role = admin) can insert rows for their org
    CREATE POLICY exp_cat_insert_org_admin ON public.expense_categories
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.organization_memberships om
          WHERE om.user_id = auth.uid()
            AND om.organization_id = expense_categories.organization_id
            AND om.role::text = 'admin'
            AND om.is_active = true
        )
      );

    CREATE POLICY exp_cat_update_org_admin ON public.expense_categories
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.organization_memberships om
          WHERE om.user_id = auth.uid()
            AND om.organization_id = expense_categories.organization_id
            AND om.role::text = 'admin'
            AND om.is_active = true
        )
      )
      WITH CHECK (
        organization_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.organization_memberships om
          WHERE om.user_id = auth.uid()
            AND om.organization_id = expense_categories.organization_id
            AND om.role::text = 'admin'
            AND om.is_active = true
        )
      );

    CREATE POLICY exp_cat_delete_org_admin ON public.expense_categories
      FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.organization_memberships om
          WHERE om.user_id = auth.uid()
            AND om.organization_id = expense_categories.organization_id
            AND om.role::text = 'admin'
            AND om.is_active = true
        )
      );

  ELSE
    -- Legacy table without organization_id: fall back to global admin in user_roles
    CREATE POLICY exp_cat_read_active ON public.expense_categories
      FOR SELECT TO authenticated
      USING (COALESCE(active, true) = true);

    CREATE POLICY exp_cat_insert_legacy_admin ON public.expense_categories
      FOR INSERT TO authenticated
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

    CREATE POLICY exp_cat_update_legacy_admin ON public.expense_categories
      FOR UPDATE TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

    CREATE POLICY exp_cat_delete_legacy_admin ON public.expense_categories
      FOR DELETE TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;
