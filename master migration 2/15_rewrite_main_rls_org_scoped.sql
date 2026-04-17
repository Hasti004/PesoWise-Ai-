-- Function: Rebuild major table policies using direct org-membership checks.

DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = profiles.organization_id
      AND om.is_active = true
  )
);

DROP POLICY IF EXISTS "Users can view their own expenses" ON public.expenses;
CREATE POLICY "Users can view their own expenses" ON public.expenses FOR SELECT
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = expenses.organization_id
      AND om.is_active = true
  )
);

DROP POLICY IF EXISTS "Users can create expenses" ON public.expenses;
CREATE POLICY "Users can create expenses" ON public.expenses FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = expenses.organization_id
      AND om.role IN ('employee', 'engineer', 'admin')
      AND om.is_active = true
  )
);

CREATE POLICY "Engineers can view assigned expenses" ON public.expenses FOR SELECT
USING (
  auth.uid() = assigned_engineer_id
  AND EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = expenses.organization_id
      AND om.role = 'engineer'
      AND om.is_active = true
  )
);

CREATE POLICY "Admins can view all expenses" ON public.expenses FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = expenses.organization_id
      AND om.role = 'admin'
      AND om.is_active = true
  )
);
