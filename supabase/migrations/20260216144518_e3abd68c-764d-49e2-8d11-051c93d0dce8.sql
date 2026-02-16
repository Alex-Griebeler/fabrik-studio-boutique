
-- Add file_hash column to bank_imports for duplicate detection
ALTER TABLE public.bank_imports ADD COLUMN IF NOT EXISTS file_hash text;
CREATE INDEX IF NOT EXISTS idx_bank_imports_file_hash ON public.bank_imports (file_hash);

-- Create payment-proofs storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for payment-proofs bucket
CREATE POLICY "Admin can manage payment proofs"
ON storage.objects FOR ALL
USING (bucket_id = 'payment-proofs' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admin can upload payment proofs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'payment-proofs' AND public.has_role(auth.uid(), 'admin'::public.app_role));
