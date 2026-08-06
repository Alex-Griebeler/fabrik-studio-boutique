SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

INSERT INTO public.expense_categories (name, slug)
VALUES
  ('Tarifas e Encargos Bancários', 'tarifas-e-encargos-bancarios'),
  ('Comissões', 'comissoes')
ON CONFLICT (slug) DO NOTHING;

CREATE TEMP TABLE _limpeza91_20260805 (
  id uuid PRIMARY KEY,
  grupo text NOT NULL,
  amount_cents bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO _limpeza91_20260805 (id, grupo, amount_cents) VALUES
('d59122af-8c17-4efe-91a6-67593260afca','A',1000000),
('25148a37-f566-4113-8091-5df64609c045','A',500000),
('3ea2fdbf-43fe-4a63-ba46-a54e0684b68a','A',329684),
('4e6f8960-8e49-4755-a878-c5f57b4d78cf','A',140000),
('196472d5-61c1-4344-8659-091fa13fb0c2','A',1534),
('67b47eb9-be66-4e9f-85fe-a7960b8a259f','A',1534),
('c330303b-3111-403b-9aee-d2ac75867abb','B',957345),
('3ea12c4e-171b-4f80-ac72-627325b59f18','B',329684),
('befb1761-549d-43b8-94e7-bb0c77feed4e','B',328616),
('c1f7d57d-f5ee-490d-b14e-bb1673342bb8','B',67815),
('78dba205-bf68-47ce-9c3d-f9382afc8389','B',1539),
('afe5f0c9-cf81-47b7-aa8e-6886f3990456','D_COMISSAO',93800),
('4b6aba7b-4e1b-47ad-9f7a-9d71ffeb8523','D_COMISSAO',93800),
('2ce0b86a-dc76-4152-a142-36ccb33344ea','D_BANCARIA',8140),
('07d988c9-baa2-41fa-bc95-4af70c68ffe5','D_BANCARIA',6300),
('72139d1e-4094-4958-b981-8e2cecfd7e78','D_BANCARIA',1539),
('23475374-72ba-48a6-a147-af861630f365','D_BANCARIA',1155),
('d568c395-ac1d-43b5-8fb1-3478cd4b0850','D_BANCARIA',762),
('eafc6566-0a81-42bd-ac74-746eabebc657','D_BANCARIA',620),
('53d7a60b-ac6a-420b-b57a-768528d0f8c9','D_BANCARIA',398),
('ecaceaa7-80e0-495c-b45d-73958ba129e0','D_BANCARIA',278),
('3b260ded-ac24-4151-87b5-6912ac9f22f3','D_BANCARIA',278),
('1032b502-8209-43b8-a1a4-b9d0d31b090c','D_BANCARIA',4),
('a0714909-f650-4bdb-b29c-ea4f3a4369f7','D_BANCARIA',977),
('ebb1ccf2-cb7a-46d5-9e69-45478b0182e5','D_BANCARIA',916),
('6c74e688-250b-4f36-8706-f95b0ebf2140','D_BANCARIA',904),
('8631fb30-3683-49d8-9f9d-b11ee9085f4b','D_BANCARIA',600),
('7a1196aa-69d2-4a29-9d74-66dc6db161b7','D_BANCARIA',482),
('d997b923-4c8c-4c53-9e1a-8a11bc2635bf','D_BANCARIA',385),
('8e61182a-2bdb-473b-8de5-629c65ccd6dd','D_OUTROS',34512),
('dfe5bdef-7bb3-4244-b29f-254a92d76ff3','D_OUTROS',17089),
('853b09f5-b1ef-415d-873d-48e770cd2aa2','C',73126),
('5c19869e-2a72-417f-aec8-87439b630ee3','C',63308),
('94af6277-c60f-4883-b8ef-f6496d9dede2','C',52734),
('16a10a61-2c23-4809-b763-a97361d0d842','C',33000),
('7068d6ef-781c-48f8-b585-33b69edfd3b1','C',31835),
('0c564d64-432a-4c63-8183-104b8f3c959e','C',28441),
('d2d8c227-cc86-4982-b0c8-28d8813428f7','C',27900),
('67c67fce-64d7-408d-9f9c-73bfcb93a3ab','C',27814),
('c4ecd8b7-5b08-476d-9632-f9297b8f2492','C',26146),
('cc96713d-74b5-44e8-a93e-0f48e9cf9d3b','C',25781),
('e9fcf2f6-2495-46f6-8cef-03c937b252c9','C',24990),
('e1d0f950-3d73-4c05-9b7e-5cc027806faf','C',24175),
('b549de75-45b4-4b7b-82ca-e627656fea10','C',23710),
('41587db7-9a1c-45f2-bacf-bc97332e8519','C',21549),
('4e96b3f7-9033-40c8-bf6a-11ef80ebcfbe','C',20970),
('ce216f1a-a63b-4415-aec8-92329d194017','C',20008),
('551daeed-cade-4cf7-87fb-847f8b38b1cb','C',18368),
('d52344c9-621d-4db6-935e-8cf39756fb57','C',18080),
('1a172f5e-c32c-4e2e-b9df-c4c011ee2825','C',17133),
('7399b97e-a730-40fb-87e1-f197003c9c9e','C',14100),
('d9823238-1bd3-4e18-a97c-259b710d4bcd','C',13844),
('c2745c1b-58bb-48fe-b904-542338cb2520','C',12746),
('18b9ff3d-9cb5-477f-876c-76e040cb6a1c','C',11250),
('56f91fb2-b745-43a4-8a84-979c52a22e1a','C',11000),
('3c1804b8-ffb1-4041-990b-cc983ede3fa9','C',9990),
('a5dbf953-88f0-495b-9b6c-b01f5e35164f','C',8892),
('1eee14d1-4c9f-4b40-8a83-254c0d31ffad','C',8420),
('6a019e11-3e8c-49ff-90a1-0f5e620a52ba','C',7992),
('f3fadc94-71de-4ea7-9195-2979c5bf2088','C',7035),
('751bd1d7-d704-42c1-9a08-e0b1cde1a1c3','C',6993),
('dcce96d4-45b4-47a6-8e6c-c26556be1ea3','C',6993),
('e1ba5fa1-d371-4f07-b819-5239eb678375','C',6790),
('263d51a9-abdc-4a0c-87ab-9820c38271b1','C',5994),
('5c563315-8e6d-431c-a18f-76fd0b9aaf19','C',5989),
('da8fb700-0ceb-497f-80de-a0c8dddaa8e0','C',5098),
('a820f84f-a9dc-41da-a010-6bde58116f23','C',5096),
('5f303ba5-175e-4f98-88d1-ec0dfb150abc','C',4995),
('1bad0bb0-5532-4f18-9e1c-37162b8a3355','C',4897),
('1ac5fbf3-4aef-46a1-a9d7-bdc50df2386b','C',4427),
('b6ba5a5b-5099-4dde-9466-b1da7a0b362d','C',4200),
('6b67db91-2e9b-4235-ad83-2a30303a272a','C',3996),
('3dfc12c3-6ae8-4856-bcc6-f60250ddff5c','C',3996),
('7907c27a-d861-41d1-aabf-3acd258dba7c','C',3934),
('bfd3cc26-f443-4712-bf9b-d5c264a94e9e','C',3500),
('3a158ca6-8f92-434f-8f13-9f6b975f73fb','C',3219),
('5f691123-a4b9-444b-b458-d8a5f606947e','C',3072),
('541dbc12-90d5-4239-8293-f6055c50821a','C',3000),
('f5bf0171-d66d-4239-a9dc-a0965ad5052f','C',2793),
('2bef1ef0-5141-42b7-ba63-272cedee754a','C',2390),
('710de2b7-d6ec-4af2-af3e-d9944631af40','C',2208),
('4d59cb21-e8d1-4cec-a957-e15fac27293d','C',2000),
('60218f78-3507-40b6-90a2-387422b6110f','C',2000),
('3acf1813-8b8b-4b1e-80c9-94a77bbd774e','C',1990),
('e35ccd0d-c342-4ad2-816e-23a3715632b0','C',1750),
('942aff6d-793a-4d61-a4f4-3f14acb48fb8','C',1589),
('d753b2e3-40f7-4229-a9c1-e120fd3e3a6d','C',1199),
('37762a11-6283-47f3-92fb-ab4e83b2bf77','C',1139),
('fffa604b-3070-4c5d-8d54-1fe321cbb6ee','C',1000),
('518e8d36-803d-4706-aefa-f70bda726213','C',999),
('f33b32ae-ad9c-4745-8942-d4d0d6492278','C',590);

DO $limpeza$
DECLARE
  cat_bancaria uuid;
  cat_comissao uuid;
  cat_outros   uuid;
  cat_aluguel  uuid;
  n int;
  soma bigint;
  pre_ok int;
  pos_ok int;
BEGIN
  LOCK TABLE public.expenses IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.expense_categories IN SHARE ROW EXCLUSIVE MODE;

  SELECT id INTO STRICT cat_bancaria FROM public.expense_categories WHERE slug = 'tarifas-e-encargos-bancarios';
  SELECT id INTO STRICT cat_comissao FROM public.expense_categories WHERE slug = 'comissoes';
  SELECT id INTO STRICT cat_outros   FROM public.expense_categories WHERE slug = 'outros';
  SELECT id INTO STRICT cat_aluguel  FROM public.expense_categories WHERE slug = 'aluguel';

  SELECT count(*) INTO n FROM public.expense_categories
  WHERE (slug = 'tarifas-e-encargos-bancarios' AND name = 'Tarifas e Encargos Bancários' AND is_active)
     OR (slug = 'comissoes' AND name = 'Comissões' AND is_active);
  IF n <> 2 THEN
    RAISE EXCEPTION 'limpeza: categorias novas com nome/estado inesperado (achei % validas de 2)', n;
  END IF;

  SELECT count(*), sum(amount_cents) INTO n, soma FROM _limpeza91_20260805;
  IF n <> 91 OR soma <> 4712863 THEN
    RAISE EXCEPTION 'limpeza: lista interna corrompida (%/%)', n, soma;
  END IF;
  IF (SELECT count(*) FROM _limpeza91_20260805 WHERE grupo = 'A') <> 6
     OR (SELECT count(*) FROM _limpeza91_20260805 WHERE grupo = 'B') <> 5
     OR (SELECT count(*) FROM _limpeza91_20260805 WHERE grupo = 'C') <> 60
     OR (SELECT count(*) FROM _limpeza91_20260805 WHERE grupo LIKE 'D%') <> 20 THEN
    RAISE EXCEPTION 'limpeza: distribuição interna dos grupos divergente';
  END IF;

  SELECT count(*) INTO n
  FROM public.expenses e
  WHERE e.notes ILIKE '%Auto-criada da importação bancária%'
    AND NOT EXISTS (SELECT 1 FROM _limpeza91_20260805 t WHERE t.id = e.id);
  IF n <> 0 THEN
    RAISE EXCEPTION 'limpeza: % linha(s) da importação fora da lista — abortando', n;
  END IF;

  SELECT count(*) INTO pre_ok
  FROM public.expenses e
  JOIN _limpeza91_20260805 t ON t.id = e.id
  WHERE e.amount_cents = t.amount_cents
    AND e.status = 'paid'
    AND e.category_id = cat_aluguel
    AND e.notes ILIKE '%Auto-criada da importação bancária%';

  SELECT count(*) INTO pos_ok
  FROM public.expenses e
  JOIN _limpeza91_20260805 t ON t.id = e.id
  WHERE e.amount_cents = t.amount_cents
    AND e.is_recurring = false
    AND e.parent_expense_id IS NULL
    AND (
      (t.grupo IN ('A','B','C') AND e.status = 'cancelled' AND e.notes ILIKE '%CANCELADA 05/08/2026%')
      OR (t.grupo = 'D_COMISSAO' AND e.status = 'paid' AND e.category_id = cat_comissao AND e.notes ILIKE '%RECATEGORIZADA 05/08/2026%')
      OR (t.grupo = 'D_BANCARIA' AND e.status = 'paid' AND e.category_id = cat_bancaria AND e.notes ILIKE '%RECATEGORIZADA 05/08/2026%')
      OR (t.grupo = 'D_OUTROS'   AND e.status = 'paid' AND e.category_id = cat_outros   AND e.notes ILIKE '%RECATEGORIZADA 05/08/2026%')
    );

  IF pos_ok = 91 THEN
    RAISE NOTICE 'limpeza: estado final ja aplicado (91/91) — nada a fazer.';
    RETURN;
  ELSIF pre_ok <> 91 THEN
    RAISE EXCEPTION 'limpeza: estado inesperado — pre=%/91, pos=%/91. Investigar antes de rodar.', pre_ok, pos_ok;
  END IF;

  SELECT count(*) INTO n
  FROM public.expenses e JOIN _limpeza91_20260805 t ON t.id = e.id
  WHERE e.is_recurring OR e.parent_expense_id IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'limpeza: % linha(s) recorrente(s)/com pai — fora do escopo', n;
  END IF;

  SELECT count(*) INTO n
  FROM public.expenses e
  WHERE e.parent_expense_id IN (SELECT id FROM _limpeza91_20260805);
  IF n <> 0 THEN
    RAISE EXCEPTION 'limpeza: % despesa(s) filha(s) dependem destas linhas', n;
  END IF;

  UPDATE public.expenses e
  SET status = 'cancelled',
      notes = concat(e.notes, ' | CANCELADA 05/08/2026: ENTRADA lançada como saída pelo bug do OFX (TRNTYPE). Não é despesa.')
  FROM _limpeza91_20260805 t
  WHERE t.id = e.id AND t.grupo = 'A';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION 'limpeza A: atualizou % linhas (esperado 6)', n; END IF;

  UPDATE public.expenses e
  SET status = 'cancelled',
      notes = concat(e.notes, ' | CANCELADA 05/08/2026: movimento de empréstimo/aplicação (Pronampe/Rende Fácil), não é despesa operacional.')
  FROM _limpeza91_20260805 t
  WHERE t.id = e.id AND t.grupo = 'B';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 5 THEN RAISE EXCEPTION 'limpeza B: atualizou % linhas (esperado 5)', n; END IF;

  UPDATE public.expenses e
  SET status = 'cancelled',
      notes = concat(e.notes, ' | CANCELADA 05/08/2026: compra do cartão — duplica a fatura do cartão lançada manualmente.')
  FROM _limpeza91_20260805 t
  WHERE t.id = e.id AND t.grupo = 'C';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 60 THEN RAISE EXCEPTION 'limpeza C: atualizou % linhas (esperado 60)', n; END IF;

  UPDATE public.expenses e
  SET category_id = cat_comissao,
      notes = concat(e.notes, ' | RECATEGORIZADA 05/08/2026: comissão.')
  FROM _limpeza91_20260805 t
  WHERE t.id = e.id AND t.grupo = 'D_COMISSAO';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'limpeza D_COMISSAO: atualizou % linhas (esperado 2)', n; END IF;

  UPDATE public.expenses e
  SET category_id = cat_bancaria,
      notes = concat(e.notes, ' | RECATEGORIZADA 05/08/2026: tarifa/encargo bancário.')
  FROM _limpeza91_20260805 t
  WHERE t.id = e.id AND t.grupo = 'D_BANCARIA';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 16 THEN RAISE EXCEPTION 'limpeza D_BANCARIA: atualizou % linhas (esperado 16)', n; END IF;

  UPDATE public.expenses e
  SET category_id = cat_outros,
      notes = concat(e.notes, ' | RECATEGORIZADA 05/08/2026: despesa real da conta (saiu de Aluguel).')
  FROM _limpeza91_20260805 t
  WHERE t.id = e.id AND t.grupo = 'D_OUTROS';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'limpeza D_OUTROS: atualizou % linhas (esperado 2)', n; END IF;

  SELECT count(*), COALESCE(sum(e.amount_cents), 0) INTO n, soma
  FROM public.expenses e JOIN _limpeza91_20260805 t ON t.id = e.id
  WHERE t.grupo IN ('A','B','C') AND e.status = 'cancelled';
  IF n <> 71 OR soma <> 4449924 THEN
    RAISE EXCEPTION 'pós A/B/C: esperado 71/4449924, achei %/%', n, soma;
  END IF;

  SELECT count(*), COALESCE(sum(e.amount_cents), 0) INTO n, soma
  FROM public.expenses e JOIN _limpeza91_20260805 t ON t.id = e.id
  WHERE t.grupo LIKE 'D%' AND e.status = 'paid';
  IF n <> 20 OR soma <> 262939 THEN
    RAISE EXCEPTION 'pós D: esperado 20/262939 ativas, achei %/%', n, soma;
  END IF;

  IF (SELECT count(*) FROM public.expenses e JOIN _limpeza91_20260805 t ON t.id = e.id
      WHERE t.grupo = 'D_COMISSAO' AND e.category_id = cat_comissao) <> 2
     OR (SELECT count(*) FROM public.expenses e JOIN _limpeza91_20260805 t ON t.id = e.id
         WHERE t.grupo = 'D_BANCARIA' AND e.category_id = cat_bancaria) <> 16
     OR (SELECT count(*) FROM public.expenses e JOIN _limpeza91_20260805 t ON t.id = e.id
         WHERE t.grupo = 'D_OUTROS' AND e.category_id = cat_outros) <> 2 THEN
    RAISE EXCEPTION 'pós D: distribuição de categorias divergente';
  END IF;

  SELECT count(*) INTO n
  FROM public.expenses e
  WHERE e.notes ILIKE '%Auto-criada da importação bancária%'
    AND e.status <> 'cancelled' AND e.category_id = cat_aluguel;
  IF n <> 0 THEN
    RAISE EXCEPTION 'pós: ainda restam % ativas em Aluguel', n;
  END IF;

  RAISE NOTICE 'limpeza concluída: 71 canceladas (R$ 44.499,24) + 20 recategorizadas (R$ 2.629,39).';
END
$limpeza$;