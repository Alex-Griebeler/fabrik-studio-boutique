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
let TRAINERS: Array<{ id: string; profile_id: string | null; hourly_rate_main_cents: number }> = [];
let INSERTED: Array<Record<string, unknown>> | null = null;
let INSERT_ERROR: { code: string; message: string } | null = null;
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

vi.mock("./useTemplates", () => ({
  useClassTemplates: () => ({
    data: [
      {
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
      },
    ],
  }),
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
            select: () => thenable({ data: EXISTING, error: null }),
            insert: (rows: Array<Record<string, unknown>>) => {
              INSERTED = rows;
              return {
                then: (resolve: (v: unknown) => void) =>
                  resolve({ error: INSERT_ERROR }),
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
    INSERTED = null;
    INSERT_ERROR = null;
    ROLES = ["admin"];
    vi.clearAllMocks();
  });

  it("grava trainers.id (NUNCA o profiles.id do template) + snapshot correto", async () => {
    renderHook(() => useAutoGenerateSessions(START, END), { wrapper });
    await waitFor(() => expect(INSERTED).not.toBeNull());

    const row = INSERTED![0];
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
    expect(INSERTED).toBeNull();
  });

  it("treinador sem tarifa: aborta com aviso, nada inserido (nunca R$0 silencioso)", async () => {
    TRAINERS = [{ id: "trainer-9", profile_id: "profile-1", hourly_rate_main_cents: 0 }];
    renderHook(() => useAutoGenerateSessions(START, END), { wrapper });
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
    expect(INSERTED).toBeNull();
  });

  it("recepção NÃO tenta gerar (policy de INSERT não permite; antes falhava mudo)", async () => {
    ROLES = ["reception"];
    renderHook(() => useAutoGenerateSessions(START, END), { wrapper });
    // dá tempo do effect rodar se fosse rodar
    await new Promise((r) => setTimeout(r, 50));
    expect(INSERTED).toBeNull();
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it("erro real de insert vira aviso visível (agenda vazia sem aviso era o modo antigo)", async () => {
    INSERT_ERROR = { code: "42501", message: "permission denied" };
    renderHook(() => useAutoGenerateSessions(START, END), { wrapper });
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
  });

  it("corrida benigna (23505, outra aba gerou primeiro) NÃO vira erro pro usuário", async () => {
    INSERT_ERROR = { code: "23505", message: "duplicate key" };
    renderHook(() => useAutoGenerateSessions(START, END), { wrapper });
    await waitFor(() => expect(INSERTED).not.toBeNull());
    await new Promise((r) => setTimeout(r, 50));
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it("sessão já existente no período não é recriada", async () => {
    EXISTING = [{ template_id: "tpl-1", session_date: "2026-08-10" }];
    renderHook(() => useAutoGenerateSessions(START, END), { wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(INSERTED).toBeNull();
  });
});
