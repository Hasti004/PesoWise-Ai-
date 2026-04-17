-- Function: Create sequence + trigger pipeline for transaction numbers and totals.

CREATE SEQUENCE IF NOT EXISTS public.expense_transaction_number_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_transaction_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  next_num := nextval('public.expense_transaction_number_seq');
  RETURN lpad(next_num::TEXT, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_transaction_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'submitted'
     AND (OLD.status IS NULL OR OLD.status <> 'submitted')
     AND NEW.transaction_number IS NULL THEN
    NEW.transaction_number := public.generate_transaction_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER update_expense_total_on_line_item
AFTER INSERT OR UPDATE OR DELETE ON public.expense_line_items
FOR EACH ROW EXECUTE FUNCTION public.update_expense_total();

CREATE TRIGGER update_notifications_updated_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.update_notifications_updated_at();

CREATE TRIGGER trigger_assign_transaction_number
BEFORE INSERT OR UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.assign_transaction_number();
