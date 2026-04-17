-- Fix attachment INSERT failing when get_user_organization_id() returns a different org
-- than expenses.organization_id (e.g. multiple memberships: SQL LIMIT 1 vs expense row).
-- Policy: uploader must own the expense and attachment.organization_id must match the expense.

DROP POLICY IF EXISTS "Users can upload attachments for their expenses" ON public.attachments;

CREATE POLICY "Users can upload attachments for their expenses"
  ON public.attachments FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.id = attachments.expense_id
        AND e.user_id = auth.uid()
        AND e.organization_id = attachments.organization_id
    )
  );
