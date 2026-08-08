-- Onda 2d: idempotência do gerador de agenda.
--
-- O auto-gerador roda no client e duas abas abertas podem passar juntas
-- pelo "select antes do insert" e criar a MESMA sessão de template em
-- duplicata. Este UNIQUE parcial fecha a corrida no banco; o client
-- trata o erro 23505 como corrida benigna (outra aba chegou primeiro).
--
-- Parcial de propósito: sessões manuais (template_id IS NULL) ficam de
-- fora — várias sessões avulsas no mesmo dia são legítimas.
--
-- Pré-verificação: aborta se JÁ existir duplicata (não pode nascer
-- constraint por cima de dado violado — limpar antes, conscientemente).

DO $chk$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
  FROM (
    SELECT template_id, session_date
    FROM public.sessions
    WHERE template_id IS NOT NULL
    GROUP BY template_id, session_date
    HAVING count(*) > 1
  ) d;
  IF n > 0 THEN
    RAISE EXCEPTION 'onda2d: % combinação(ões) template+data duplicada(s) em sessions — limpar antes de criar o UNIQUE', n;
  END IF;
END
$chk$;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_template_date_unique
  ON public.sessions (template_id, session_date)
  WHERE template_id IS NOT NULL;
