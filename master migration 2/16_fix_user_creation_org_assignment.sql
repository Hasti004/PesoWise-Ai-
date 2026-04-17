-- Function: Make auth trigger create profile + membership for tenant-aware setup.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
BEGIN
  IF NEW.raw_user_meta_data IS NOT NULL AND NEW.raw_user_meta_data->>'organization_id' IS NOT NULL THEN
    v_org := (NEW.raw_user_meta_data->>'organization_id')::UUID;
  END IF;

  IF v_org IS NULL THEN
    SELECT id INTO v_org FROM public.organizations WHERE slug = 'default' LIMIT 1;
  END IF;

  IF v_org IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (user_id, name, email, organization_id, is_active)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', 'New User'), NEW.email, v_org, true)
  ON CONFLICT (user_id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id,
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        is_active = true;

  INSERT INTO public.organization_memberships (organization_id, user_id, role, is_active)
  VALUES (v_org, NEW.id, 'employee', true)
  ON CONFLICT (user_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    is_active = true;

  RETURN NEW;
END;
$$;
