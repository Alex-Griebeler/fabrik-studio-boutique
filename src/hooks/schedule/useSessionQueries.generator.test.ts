// Testes do auto-gerador de agenda (Onda 2d, exigência da auditoria):
// o ponto mais perigoso é o MAPEAMENTO DE CHAVES — template.instructor_id
// é profiles.id; sessions.trainer_id é trainers.id; o elo é
// trainers.profile_id. Usar a chave errada compilava, passava no lint,
// e derrubava o insert inteiro em produção por violação de FK.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

let EXISTING: Array<{ template_id: string; session_date: string }> = [];
let EXISTING_AFTER_CONFLICT: Array<{ template_id: string; session_date: string }> | null = null;
let SESSION_SELECT_COUNT = 0;
let SESSION_SELECT_ERROR_AFTER: { message: string } | null = null;
let TRAINERS: Array<{ id: string; profile_id: string | null; hourly_rate_main_cents: number }> = [];
let INSERT_CALLS: Array<Array<Record<string, unknown>>> = [];
let INSERT_ERRORS: Array<{ code: string; message: string } | null> = [];
let ROLES: string[] = ["admin"];

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/hooks/useUserRoles", () => ({
  useUserRoles: () => ({
    roles: ROLES,
    loading: false,
    hasRole: (r: string) => ROLES.includes(r),
    hasAnyRole: (check: string[]) => check.some((r) => ROLES.includes(r)),
  }),
}));

const BASE_TEMPLATE = {
  id: "tpl-1",
  instructor_id: "profile-1",
  day_of_week: 1, // segunda
  start_time: "07:00",
  duration_minutes: 60,
  modality: "flow",
  capacity: 12,
  recurrence_start: "2026-01-01",
  recurrence_end: null,
  is_active: true,
};
let TEMPLATES: Array<typeof BASE_TEMPLATE> = [BASE_TEMPLATE];

vi.mock("./useTemplates", () => ({
  useClassTemplates: () => ({ data: TEMPLATES }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const thenable = (result: { data: unknown; error: unknown }) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of ["select", "gte", "lte", "not", "in", "order", "eq"]) b[m] = chain;
    b.then = (resolve: (v: unknown) => void) => resolve(result);
    return b;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "sessions") {
          return {
            select: () => {
              SESSION_SELECT_COUNT += 1;
              if (SESSION_SELECT_COUNT > 1 && SESSION_SELECT_ERROR_AFTER) {
                return thenable({ data: null, error: SESSION_SELECT_ERROR_AFTER });
              }
              const data =
                SESSION_SELECT_COUNT > 1 && EXISTING_AFTER_CONFLICT !== null
                  ? EXISTING_AFTER_CONFLICT
                  : EXISTING;
              return thenable({ data, error: null });
            },
            insert: (rows: Array<Record<string, unknown>>) => {
              INSERT_CALLS.push(rows);
              const err = INSERT_ERRORS.length > 0 ? INSERT_ERRORS.shift()! : null;
              return {
                then: (resolve: (v: unknown) => void) => resolve({ error: err }),
              };
            },
          };
        }
        if (table === "trainers") {
          return { select: () => thenable({ data: TRAINERS, error: null }) };
        }
        throw new Error(`tabela inesperada no teste: ${table}`);
      },
    },
  };
});

import { useAutoGenerateSessions } from "./useSessionQueries";
import { toast } from "sonner";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

// Semana com uma segunda-feira dentro do range: 2026-08-10.
const START = "2026-08-10";
const END = "2026-08-10";

describe("useAutoGenerateSessions — mapeamento profile→trainer", () => {
  beforeEach(() => {
    EXISTING = [];
    TRAINERS = [{ id: "trainer-9", profile_id: "profile-1", hourly_rate_main_cents: 12000 }];
    INSERT_CALLS = [];
    INSERT_ERRORS = [];
    EXISTING_AFTER_CONFLICT = null;
    SESSION_SELECT_COUNT = 0;
    SESSION_SELECT_ERROR_AFTER = null;
    ROLES = ["admin"];
    TEMPLATES = [BASE_TEMPLATE];
    vi.clearAllMocks();
  });

  it("grava trainers.id (NUNCA o profiles.id do template) + snapshot correto", async () => {
    renderHook(() => useAutoGenerateSessions(START, END), { wrapper });
    await waitFor(() => expect(INSERT_CALLS.length).toBeGreaterThan(0));

    const row = INSERT_CALLS[0][0];
    expect(row.trainer_id).toBe("trainer-9");
    expect(row.trainer_id).not.toBe("profile-1");
    expect(row.trainer_hourly_rate_cents).toBe(12000);
    expect(row.payment_hours).toBe(1);
    expect(row.payment_amount_cents).toBe(12000);
  });

  it("instrutor SEM cadastro de treinador vinculado: aborta com aviso, nada inserido", async () => {
    TRAINERS = [];
    renderHook(() => useAutoGenerateSessions(START, END), { wrapper });
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
    expect(INSERT_CALLS).toHaveLength(0);
  });

  it("treinador sem tarifa: aborta com aviso, nada inserido (nunca R$0 silencioso)", async () => {
    TRAINERS = [{ id: "trainer-9", profile_id: "profile-1", hourly_rate_main_cents: 0 }];
    renderHook(() => useAutoGenerateSessions(START, END), { wrapper });
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
    expect(INSERT_CALLS).toHaveLength(0);
  });

  it("recepção NÃO tenta gerar (policy de INSERT não permite; antes falhava mudo)", async () => {
    ROLES = ["reception"];
    renderHook(() => useAutoGenerateSessions(START, END), { wrapper });
    // dá tempo do effect rodar se fosse rodar
    await new Promise((r) => setTimeout(r, 50));
    expect(INSERT_CALLS).toHaveLength(0);
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it("erro real de insert vira aviso visível (agenda vazia sem aviso era o modo antigo)", async () => {
    INSERT_ERRORS = [{ code: "42501", message: "permission denied" }];
    renderHook(() => useAutoGenerateSessions(START, END), { wrapper });
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
  });

  it("corrida benigna (23505, outra aba gerou primeiro) NÃO vira erro pro usuário", async () => {
    INSERT_ERRORS = [{ code: "23505", message: "duplicate key" }];
    // Na releitura pós-conflito, a sessão JÁ existe (outra aba criou):
    // nada resta a inserir e nenhum erro chega ao usuário.
    EXISTING_AFTER_CONFLICT = [{ template_id: "tpl-1", session_date: "2026-08-10" }];
    renderHook(() => useAutoGenerateSessions(START, END), { wrapper });
    await waitFor(() => expect(INSERT_CALLS.length).toBe(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it("conflito PARCIAL (23505): retry reinsere SÓ a linha que faltou", async () => {
    INSERT_ERRORS = [{ code: "23505", message: "duplicate key" }, null];
    // Range com DUAS segundas (10 e 17/08). Outra aba criou só a do
    // dia 10 → o lote de 2 conflita inteiro; o retry deve inserir
    // exatamente a do dia 17, nada mais.
    EXISTING_AFTER_CONFLICT = [{ template_id: "tpl-1", session_date: "2026-08-10" }];
    renderHook(() => useAutoGenerateSessions("2026-08-10", "2026-08-17"), { wrapper });
    await waitFor(() => expect(INSERT_CALLS.length).toBe(2));

    expect(INSERT_CALLS[0]).toHaveLength(2); // lote original: 10 e 17
    expect(INSERT_CALLS[1]).toHaveLength(1); // retry: só a que faltou
    expect(INSERT_CALLS[1][0].session_date).toBe("2026-08-17");
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it("releitura pós-conflito com ERRO: aborta com aviso (nunca reinsere às cegas)", async () => {
    INSERT_ERRORS = [{ code: "23505", message: "duplicate key" }];
    SESSION_SELECT_ERROR_AFTER = { message: "network down" };
    renderHook(() => useAutoGenerateSessions(START, END), { wrapper });
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
    expect(INSERT_CALLS).toHaveLength(1); // nenhum segundo insert às cegas
  });

  it("template SEM instrutor: turma é pulada com AVISO, e as demais geram", async () => {
    TEMPLATES = [
      { ...BASE_TEMPLATE, id: "tpl-sem-instrutor", instructor_id: null as unknown as string },
      { ...BASE_TEMPLATE, id: "tpl-ok" },
    ];
    renderHook(() => useAutoGenerateSessions(START, END), { wrapper });
    await waitFor(() => expect(INSERT_CALLS.length).toBe(1));
    // só a turma íntegra entra; a incompleta NÃO vira sessão sem valor
    expect(INSERT_CALLS[0]).toHaveLength(1);
    expect(INSERT_CALLS[0][0].template_id).toBe("tpl-ok");
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      expect.stringContaining("sem instrutor"),
    );
  });

  it("template quebrado FORA do período não trava a geração dos válidos", async () => {
    TEMPLATES = [
      // encerrado em 2025: não produz nada no período → não valida nada
      { ...BASE_TEMPLATE, id: "tpl-encerrado", instructor_id: "profile-fantasma", recurrence_end: "2025-12-31" },
      { ...BASE_TEMPLATE, id: "tpl-ok" },
    ];
    renderHook(() => useAutoGenerateSessions(START, END), { wrapper });
    await waitFor(() => expect(INSERT_CALLS.length).toBe(1));
    expect(INSERT_CALLS[0]).toHaveLength(1);
    expect(INSERT_CALLS[0][0].template_id).toBe("tpl-ok");
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it("dois treinadores no MESMO perfil: turma pulada com aviso (não trava as demais)", async () => {
    TRAINERS = [
      { id: "trainer-9", profile_id: "profile-1", hourly_rate_main_cents: 12000 },
      { id: "trainer-10", profile_id: "profile-1", hourly_rate_main_cents: 9000 },
    ];
    renderHook(() => useAutoGenerateSessions(START, END), { wrapper });
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
    expect(INSERT_CALLS).toHaveLength(0);
  });

  it("sessão já existente no período não é recriada", async () => {
    EXISTING = [{ template_id: "tpl-1", session_date: "2026-08-10" }];
    renderHook(() => useAutoGenerateSessions(START, END), { wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(INSERT_CALLS).toHaveLength(0);
  });
});
