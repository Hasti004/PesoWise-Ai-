-- Function: Rewire expense trigger to org transaction generator and enforce uniqueness.

DROP TRIGGER IF EXISTS trigger_assign_transaction_number ON public.expenses;
DROP FUNCTION IF EXISTS public.assign_transaction_number();

CREATE OR REPLACE FUNCTION public.assign_transaction_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'submitted'
     AND (OLD.status IS NULL OR OLD.status <> 'submitted')
     AND NEW.transaction_number IS NULL
     AND NEW.organization_id IS NOT NULL THEN
    NEW.transaction_number := public.generate_transaction_number(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_assign_transaction_number
BEFORE INSERT OR UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.assign_transaction_number();

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_transaction_number_key;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_transaction_number_org_unique;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_transaction_number_org_unique UNIQUE (transaction_number, organization_id);
