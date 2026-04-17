-- Function: Provide admin utilities for org assignment, admin role fix, and org financial reset.

CREATE OR REPLACE FUNCTION public.assign_user_to_organization(
  p_user_id UUID,
  p_organization_id UUID,
  p_role public.app_role DEFAULT 'employee'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email, organization_id, is_active)
  SELECT p_user_id,
         COALESCE((SELECT raw_user_meta_data->>'name' FROM auth.users WHERE id = p_user_id), 'New User'),
         (SELECT email FROM auth.users WHERE id = p_user_id),
         p_organization_id,
         true
  ON CONFLICT (user_id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id,
        is_active = true;

  INSERT INTO public.organization_memberships (organization_id, user_id, role, is_active)
  VALUES (p_organization_id, p_user_id, p_role, true)
  ON CONFLICT (user_id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id,
        role = EXCLUDED.role,
        is_active = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_organization_financial_data(target_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications WHERE organization_id = target_org_id;
  DELETE FROM public.money_return_requests WHERE organization_id = target_org_id;
  DELETE FROM public.money_assignments WHERE organization_id = target_org_id;
  DELETE FROM public.attachments WHERE organization_id = target_org_id;
  DELETE FROM public.audit_logs WHERE organization_id = target_org_id;
  DELETE FROM public.expense_line_items WHERE organization_id = target_org_id;
  DELETE FROM public.expenses WHERE organization_id = target_org_id;
  UPDATE public.profiles SET balance = 0, updated_at = now() WHERE organization_id = target_org_id;
  DELETE FROM public.organization_transaction_sequences WHERE organization_id = target_org_id;
END;
$$;
