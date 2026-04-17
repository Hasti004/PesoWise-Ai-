-- Function: Switch transaction numbering from global sequence to per-organization sequence.

CREATE TABLE public.organization_transaction_sequences (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  next_number INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_transaction_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org transaction sequence"
ON public.organization_transaction_sequences FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = organization_transaction_sequences.organization_id
      AND om.is_active = true
  )
);

CREATE OR REPLACE FUNCTION public.generate_transaction_number(org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  INSERT INTO public.organization_transaction_sequences (organization_id, next_number, updated_at)
  VALUES (org_id, 1, now())
  ON CONFLICT (organization_id) DO NOTHING;

  PERFORM next_number
  FROM public.organization_transaction_sequences
  WHERE organization_id = org_id
  FOR UPDATE;

  UPDATE public.organization_transaction_sequences
  SET next_number = next_number + 1, updated_at = now()
  WHERE organization_id = org_id
  RETURNING next_number INTO next_num;

  RETURN lpad(next_num::TEXT, 5, '0');
END;
$$;
