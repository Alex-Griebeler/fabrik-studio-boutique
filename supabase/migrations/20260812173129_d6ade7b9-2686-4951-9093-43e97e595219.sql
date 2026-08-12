DO $del$
DECLARE
  v_auth uuid := '9bd954e4-e57b-4630-977d-b54b76b754cc';
  v_email text;
  v_papeis int;
  v_ativa boolean;
BEGIN
  SELECT email, (email_confirmed_at IS NOT NULL OR last_sign_in_at IS NOT NULL)
    INTO v_email, v_ativa
  FROM auth.users WHERE id = v_auth;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'abortado: conta % não existe (já removida?)', v_auth;
  END IF;
  IF lower(v_email) <> 'fabrik.btob@gmail.com' THEN
    RAISE EXCEPTION 'abortado: id não corresponde ao e-mail esperado (achei %)', v_email;
  END IF;
  IF v_ativa THEN
    RAISE EXCEPTION 'abortado: a conta foi aceita ou usada — não é mais conta de teste';
  END IF;

  SELECT count(*) INTO v_papeis FROM public.user_roles WHERE user_id = v_auth;
  IF v_papeis > 0 THEN
    RAISE EXCEPTION 'abortado: a conta ganhou % papel(is) desde a verificação', v_papeis;
  END IF;

  DELETE FROM auth.users WHERE id = v_auth;
  RAISE NOTICE 'conta % removida', v_email;
END;
$del$;