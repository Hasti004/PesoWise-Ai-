-- Allow owners / assigned engineers / org admins to read attachment rows when
-- attachment.organization_id matches the expense, without relying on get_user_organization_id().

DROP POLICY IF EXISTS "Users can view attachments of viewable expenses" ON public.attachments;

CREATE POLICY "Users can view attachments of viewable expenses"
  ON public.attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.id = attachments.expense_id
        AND e.organization_id = attachments.organization_id
        AND (
          e.user_id = auth.uid()
          OR e.assigned_engineer_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.organization_memberships om
            WHERE om.user_id = auth.uid()
              AND om.organization_id = e.organization_id
              AND om.role = 'admin'
              AND om.is_active = true
          )
        )
    )
  );
