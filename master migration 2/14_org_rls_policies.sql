-- Function: Enable RLS on org tables and enforce org-bound visibility.

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own organization"
ON public.organizations FOR SELECT
USING (id = public.get_user_organization_id());

CREATE POLICY "Admins can update own organization"
ON public.organizations FOR UPDATE
USING (id = public.get_user_organization_id() AND public.has_org_role('admin'))
WITH CHECK (id = public.get_user_organization_id() AND public.has_org_role('admin'));

CREATE POLICY "Users can view memberships in own organization"
ON public.organization_memberships FOR SELECT
USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Admins manage memberships in own organization"
ON public.organization_memberships FOR ALL
USING (organization_id = public.get_user_organization_id() AND public.has_org_role('admin'))
WITH CHECK (organization_id = public.get_user_organization_id() AND public.has_org_role('admin'));

CREATE POLICY "Users can view own organization settings"
ON public.organization_settings FOR SELECT
USING (organization_id = public.get_user_organization_id());
