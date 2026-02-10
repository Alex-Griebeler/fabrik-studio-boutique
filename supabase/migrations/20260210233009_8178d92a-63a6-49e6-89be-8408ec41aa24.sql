
-- Tabela para NF-e (Notas Fiscais de Serviço Eletrônicas)
CREATE TABLE public.nfse (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relacionamentos
  invoice_id UUID NOT NULL REFERENCES public.invoices(id),
  student_id UUID REFERENCES public.students(id),
  contract_id UUID REFERENCES public.contracts(id),
  
  -- Dados da NF-e
  nfse_number TEXT,
  external_id TEXT, -- ID na API Focusnfe
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',       -- Aguardando emissão
    'processing',    -- Enviada à prefeitura
    'authorized',    -- Autorizada
    'cancelled',     -- Cancelada
    'error'          -- Erro na emissão
  )),
  
  -- Valores
  amount_cents INTEGER NOT NULL,
  service_description TEXT NOT NULL DEFAULT 'Serviços de treinamento funcional',
  
  -- Dados do tomador (snapshot do aluno no momento da emissão)
  tomador_nome TEXT NOT NULL,
  tomador_cpf TEXT,
  tomador_email TEXT,
  tomador_endereco JSONB,
  
  -- Resposta da API
  authorization_date TIMESTAMP WITH TIME ZONE,
  pdf_url TEXT,
  xml_url TEXT,
  verification_code TEXT,
  error_message TEXT,
  api_response JSONB,
  
  -- Email
  email_sent BOOLEAN DEFAULT FALSE,
  email_sent_at TIMESTAMP WITH TIME ZONE,
  email_sent_to TEXT[],
  
  -- Cancelamento
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancelled_by UUID,
  cancellation_reason TEXT,
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Índices
CREATE INDEX idx_nfse_invoice ON public.nfse(invoice_id);
CREATE INDEX idx_nfse_student ON public.nfse(student_id);
CREATE INDEX idx_nfse_status ON public.nfse(status);
CREATE INDEX idx_nfse_number ON public.nfse(nfse_number);
CREATE INDEX idx_nfse_external ON public.nfse(external_id);
CREATE UNIQUE INDEX unique_nfse_invoice ON public.nfse(invoice_id) WHERE status != 'cancelled' AND status != 'error';

-- Trigger para updated_at
CREATE TRIGGER update_nfse_updated_at
  BEFORE UPDATE ON public.nfse
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.nfse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nfse_select" ON public.nfse FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "nfse_insert" ON public.nfse FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "nfse_update" ON public.nfse FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "nfse_delete" ON public.nfse FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
