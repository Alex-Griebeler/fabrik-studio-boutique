
-- Create payroll_cycles table
CREATE TABLE public.payroll_cycles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competencia DATE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE,
  closed_by UUID
);

-- Create payroll_disputes table
CREATE TABLE public.payroll_disputes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  trainer_id UUID NOT NULL,
  dispute_reason TEXT NOT NULL,
  dispute_detail TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX idx_payroll_cycles_competencia ON payroll_cycles(competencia);
CREATE INDEX idx_payroll_cycles_status ON payroll_cycles(status);
CREATE INDEX idx_payroll_disputes_session_id ON payroll_disputes(session_id);
CREATE INDEX idx_payroll_disputes_trainer_id ON payroll_disputes(trainer_id);
CREATE INDEX idx_payroll_disputes_status ON payroll_disputes(status);

-- Enable RLS
ALTER TABLE public.payroll_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_disputes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payroll_cycles
CREATE POLICY "admin_full_access_cycles" ON payroll_cycles 
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "manager_view_cycles" ON payroll_cycles 
  FOR SELECT USING (has_role(auth.uid(), 'manager'::app_role));

-- RLS Policies for payroll_disputes
CREATE POLICY "admin_full_access_disputes" ON payroll_disputes 
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "trainer_view_own_disputes" ON payroll_disputes 
  FOR SELECT USING (
    trainer_id IN (
      SELECT t.id FROM trainers t
      JOIN profiles p ON p.id = t.profile_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "trainer_update_own_disputes" ON payroll_disputes 
  FOR UPDATE USING (
    trainer_id IN (
      SELECT t.id FROM trainers t
      JOIN profiles p ON p.id = t.profile_id
      WHERE p.auth_user_id = auth.uid()
    )
  );
