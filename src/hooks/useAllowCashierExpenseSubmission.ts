import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches organization_settings.allow_cashier_expense_submission for the current org.
 * Used to gate cashier expense creation/edit UI and to show Add Expense for cashiers when enabled.
 */
export function useAllowCashierExpenseSubmission(): {
  allowCashierExpenseSubmission: boolean | null;
  loading: boolean;
} {
  const { organizationId } = useAuth();
  const [allowCashierExpenseSubmission, setAllowCashierExpenseSubmission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) {
      setAllowCashierExpenseSubmission(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from("organization_settings")
        .select("allow_cashier_expense_submission")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        setAllowCashierExpenseSubmission(false);
        setLoading(false);
        return;
      }
      setAllowCashierExpenseSubmission(data?.allow_cashier_expense_submission === true);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return { allowCashierExpenseSubmission, loading };
}
