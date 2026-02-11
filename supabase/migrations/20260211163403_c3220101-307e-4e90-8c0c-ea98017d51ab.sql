-- Trigger 1: Auto-criar tarefa "Primeiro Contato" quando lead novo é criado
CREATE OR REPLACE FUNCTION public.auto_create_first_contact_task()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.consultant_id IS NOT NULL THEN
    INSERT INTO public.tasks (
      tipo, 
      lead_id, 
      assignee_id, 
      titulo, 
      descricao, 
      data_prevista, 
      prioridade,
      status
    )
    VALUES (
      'ligar'::task_type,
      NEW.id,
      NEW.consultant_id,
      'Primeiro contato: ' || NEW.name,
      'Fazer primeiro contato com o lead ' || NEW.name || ' (telefone: ' || COALESCE(NEW.phone, 'não informado') || ')',
      now() + interval '1 hour',
      'alta'::task_priority,
      'pendente'::task_status
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Trigger 2: Auto-criar tarefa "Lembrete Experimental" 1 dia antes do agendamento
CREATE OR REPLACE FUNCTION public.auto_create_trial_reminder_task()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.trial_date IS NOT NULL AND OLD.trial_date IS DISTINCT FROM NEW.trial_date THEN
    INSERT INTO public.tasks (
      tipo,
      lead_id,
      assignee_id,
      titulo,
      descricao,
      data_prevista,
      prioridade,
      status
    )
    SELECT
      'lembrete'::task_type,
      NEW.id,
      NEW.consultant_id,
      'Lembrete: Experimental de ' || NEW.name,
      'Lembrar o lead ' || NEW.name || ' sobre a aula experimental em ' || NEW.trial_date::text || ' às ' || COALESCE(NEW.trial_time, 'horário a confirmar'),
      (NEW.trial_date::timestamp - interval '1 day'),
      'media'::task_priority,
      'pendente'::task_status
    WHERE NEW.consultant_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Trigger 3: Auto-criar tarefa "Resgate" quando lead não tem interação por 3 dias
CREATE OR REPLACE FUNCTION public.auto_create_rescue_task()
RETURNS TRIGGER AS $$
BEGIN
  -- Verifica se lead foi criado há mais de 3 dias e ainda está "new" ou "contacted"
  IF (now() - NEW.created_at) > interval '3 days' 
     AND NEW.status IN ('new', 'contacted')
     AND NEW.consultant_id IS NOT NULL THEN
    
    INSERT INTO public.tasks (
      tipo,
      lead_id,
      assignee_id,
      titulo,
      descricao,
      data_prevista,
      prioridade,
      status
    )
    VALUES (
      'resgate'::task_type,
      NEW.id,
      NEW.consultant_id,
      'Resgate: ' || NEW.name,
      'Lead ' || NEW.name || ' sem interação há 3 dias. Fazer contato urgente.',
      now(),
      'alta'::task_priority,
      'pendente'::task_status
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Criar triggers (se não existirem)
DROP TRIGGER IF EXISTS trigger_auto_create_first_contact_task ON public.leads;
CREATE TRIGGER trigger_auto_create_first_contact_task
AFTER INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_first_contact_task();

DROP TRIGGER IF EXISTS trigger_auto_create_trial_reminder_task ON public.leads;
CREATE TRIGGER trigger_auto_create_trial_reminder_task
AFTER UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_trial_reminder_task();

DROP TRIGGER IF EXISTS trigger_auto_create_rescue_task ON public.leads;
CREATE TRIGGER trigger_auto_create_rescue_task
AFTER UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_rescue_task();