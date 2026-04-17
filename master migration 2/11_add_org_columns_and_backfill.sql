-- Function: Add organization_id to app tables and migrate existing rows.

ALTER TABLE public.profiles ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.expense_line_items ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.attachments ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.audit_logs ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.expense_categories ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.locations ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.engineer_locations ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.money_assignments ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.money_return_requests ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.settings ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

DO $$
DECLARE
  v_org UUID;
BEGIN
  INSERT INTO public.organizations (name, slug, plan, subscription_status)
  VALUES ('Default Organization', 'default', 'pro', 'active')
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_org FROM public.organizations WHERE slug = 'default' LIMIT 1;

  UPDATE public.profiles SET organization_id = v_org WHERE organization_id IS NULL;
  UPDATE public.expenses e SET organization_id = p.organization_id FROM public.profiles p WHERE p.user_id = e.user_id AND e.organization_id IS NULL;
  UPDATE public.expense_line_items li SET organization_id = e.organization_id FROM public.expenses e WHERE e.id = li.expense_id AND li.organization_id IS NULL;
  UPDATE public.attachments a SET organization_id = e.organization_id FROM public.expenses e WHERE e.id = a.expense_id AND a.organization_id IS NULL;
  UPDATE public.audit_logs l SET organization_id = e.organization_id FROM public.expenses e WHERE e.id = l.expense_id AND l.organization_id IS NULL;
  UPDATE public.expense_categories SET organization_id = v_org WHERE organization_id IS NULL;
  UPDATE public.locations SET organization_id = v_org WHERE organization_id IS NULL;
  UPDATE public.engineer_locations el SET organization_id = l.organization_id FROM public.locations l WHERE l.id = el.location_id AND el.organization_id IS NULL;
  UPDATE public.money_assignments m SET organization_id = p.organization_id FROM public.profiles p WHERE p.user_id = m.cashier_id AND m.organization_id IS NULL;
  UPDATE public.money_return_requests r SET organization_id = p.organization_id FROM public.profiles p WHERE p.user_id = r.requester_id AND r.organization_id IS NULL;
  UPDATE public.notifications n SET organization_id = p.organization_id FROM public.profiles p WHERE p.user_id = n.user_id AND n.organization_id IS NULL;
  UPDATE public.settings SET organization_id = v_org WHERE organization_id IS NULL;

  INSERT INTO public.organization_memberships (organization_id, user_id, role, is_active)
  SELECT v_org, p.user_id, COALESCE((SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = p.user_id LIMIT 1), 'employee'::public.app_role), true
  FROM public.profiles p
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.organization_settings (organization_id)
  VALUES (v_org)
  ON CONFLICT (organization_id) DO NOTHING;
END $$;
