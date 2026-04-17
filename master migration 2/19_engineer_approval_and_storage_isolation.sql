-- Function: Enforce engineer approval limit + harden storage by organization boundaries.

CREATE OR REPLACE FUNCTION public.check_engineer_approval_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  approver_role TEXT;
  approval_limit NUMERIC(10,2);
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved') THEN
    SELECT role INTO approver_role
    FROM public.organization_memberships
    WHERE user_id = auth.uid()
      AND organization_id = NEW.organization_id
      AND is_active = true
    LIMIT 1;

    IF approver_role = 'engineer' THEN
      SELECT engineer_approval_limit INTO approval_limit
      FROM public.organization_settings
      WHERE organization_id = NEW.organization_id
      LIMIT 1;
      IF COALESCE(approval_limit, 50000) < NEW.total_amount THEN
        RAISE EXCEPTION 'Engineer approval limit exceeded';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_engineer_approval_limit ON public.expenses;
CREATE TRIGGER enforce_engineer_approval_limit
BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.check_engineer_approval_limit();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('organization-logos', 'organization-logos', true, 5242880, ARRAY['image/png','image/jpeg','image/jpg','image/svg+xml','image/webp'])
ON CONFLICT (id) DO NOTHING;
