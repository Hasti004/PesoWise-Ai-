-- Function: Add indexes and uniqueness constraints for performance and integrity.

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_transaction_number_key UNIQUE (transaction_number);

CREATE INDEX idx_profiles_reporting_engineer ON public.profiles(reporting_engineer_id);
CREATE INDEX idx_profiles_cashier_assigned_engineer ON public.profiles(cashier_assigned_engineer_id);
CREATE INDEX idx_profiles_assigned_cashier ON public.profiles(assigned_cashier_id);
CREATE INDEX idx_profiles_cashier_assigned_location ON public.profiles(cashier_assigned_location_id);

CREATE INDEX idx_expenses_user_id ON public.expenses(user_id);
CREATE INDEX idx_expenses_assigned_engineer_id ON public.expenses(assigned_engineer_id);
CREATE INDEX idx_expenses_status ON public.expenses(status);
CREATE INDEX idx_expenses_transaction_number ON public.expenses(transaction_number);

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(user_id, read);
CREATE INDEX idx_money_assignments_recipient_returned ON public.money_assignments(recipient_id, is_returned);
CREATE INDEX idx_money_assignments_cashier ON public.money_assignments(cashier_id);
CREATE INDEX idx_engineer_locations_engineer_id ON public.engineer_locations(engineer_id);
CREATE INDEX idx_engineer_locations_location_id ON public.engineer_locations(location_id);
