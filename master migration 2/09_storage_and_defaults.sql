-- Function: Create storage buckets/policies and base settings.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
('receipts', 'receipts', true, 10485760, ARRAY['image/jpeg','image/jpg','image/png']),
('expense-attachments', 'expense-attachments', false, 10485760, ARRAY['image/jpeg','image/jpg','image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "receipts_select_policy"
ON storage.objects FOR SELECT
USING (bucket_id = 'receipts');

CREATE POLICY "receipts_insert_policy"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'receipts' AND auth.uid() IS NOT NULL);

CREATE POLICY "expense_attachments_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'expense-attachments' AND auth.uid() IS NOT NULL);

INSERT INTO public.settings (key, value, description)
VALUES
('engineer_approval_limit', '50000', 'Maximum amount that engineer can approve directly'),
('attachment_required_above_amount', '50', 'Attachment required above this amount')
ON CONFLICT (key) DO NOTHING;
