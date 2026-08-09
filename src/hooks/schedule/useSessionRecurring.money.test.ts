// Testes de DINHEIRO das edições recorrentes (PR-C, achados da auditoria):
// 1) "editar todos" com nova duração RECALCULA as não-pagas pela tarifa
//    CONGELADA de cada sessão (hourly), mantém o valor cravado das
//    per_session (só horas mudam) e NÃO toca nas pagas;
// 2) "este e seguintes" NUNCA deleta sessão paga (registro de folha);
// 3) o INSERT da criação manual carrega service_type_id + payment_rate_basis
//    (o form mandava e a mutation descartava — falso verde de mock).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

type Row = Record<string, unknown>;
let AFFECTED_SESSIONS: Row[] = [];
let FUTURE_SESSIONS: Row[] = [];
const updateCalls: Array<{ table: string; data: Row; filters: Array<[string, string, unknown]> }> = [];
const deleteCalls: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];
const insertCalls: Array<{ table: string; data: Row }> = [];

vi.mock("@/integrations/supabase/client", () => {
  const makeBuilder = (table: string, op: string, data?: Row) => {
    const filters: Array<[string, string, unknown]> = [];
    const b: Record<string, unknown> = {};
    const record = (method: string) => (col: string, val: unknown) => {
      filters.push([method, col, val]);
      return b;
    };
    b.eq = record("eq");
    b.gte = record("gte");
    b.in = record("in");
    b.single = () =>
      Promise.resolve({ data: { id: "tpl-1", modality: "flow", day_of_week: 1, start_time: "07:00", duration_minutes: 60, capacity: 12, instructor_id: null, location: null, recurrence_end: null }, error: null });
    b.then = (resolve: (v: unknown) => void) => {
      if (op === "update") updateCalls.push({ table, data: data!, filters });
      if (op === "delete") deleteCalls.push({ table, filters });
      if (op === "select") {
        // dois selects de sessions: o de recompute (payment) e o de futuras (id)
        const wantsPayment = String(data?.cols ?? "").includes("payment_rate_basis");
        return resolve({ data: wantsPayment ? AFFECTED_SESSIONS : FUTURE_SESSIONS, error: null });
      }
      return resolve({ error: null });
    };
    return b;
  };
  return {
    supabase: {
      from: (table: string) => ({
        select: (cols?: string) => makeBuilder(table, "select", { cols }),
        update: (data: Row) => makeBuilder(table, "update", data),
        delete: () => makeBuilder(table, "delete"),
        insert: (data: Row) => {
          insertCalls.push({ table, data });
          return { then: (r: (v: unknown) => void) => r({ error: null }) };
        },
      }),
    },
  };
});

import { useUpdateAllOccurrences, useUpdateThisAndFollowing } from "./useSessionRecurring";
import { useCreateSession } from "./useSessionMutations";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useUpdateAllOccurrences — duração muda, dinheiro acompanha", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    deleteCalls.length = 0;
    insertCalls.length = 0;
    AFFECTED_SESSIONS = [
      { id: "s-hourly", trainer_hourly_rate_cents: 10000, payment_rate_basis: "hourly" },
      { id: "s-legada", trainer_hourly_rate_cents: 12000, payment_rate_basis: null },
      { id: "s-fisio", trainer_hourly_rate_cents: 10800, payment_rate_basis: "per_session" },
    ];
  });

  it("hourly e legada recalculam pela tarifa CONGELADA; per_session mantém o valor", async () => {
    const { result } = renderHook(() => useUpdateAllOccurrences(), { wrapper });
    result.current.mutate({ templateId: "tpl-1", updates: { duration_minutes: 90 } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const recomputes = updateCalls.filter(
      (c) => c.table === "sessions" && c.filters.some(([m, col]) => m === "eq" && col === "id"),
    );
    expect(recomputes).toHaveLength(3);

    const byId = Object.fromEntries(
      recomputes.map((c) => [c.filters.find(([, col]) => col === "id")![2] as string, c.data]),
    );
    expect(byId["s-hourly"].payment_amount_cents).toBe(15000); // 1,5h × 100/h
    expect(byId["s-hourly"].payment_hours).toBe(1.5);
    expect(byId["s-legada"].payment_amount_cents).toBe(18000); // base null = hourly implícito
    expect(byId["s-fisio"]).not.toHaveProperty("payment_amount_cents"); // cravado
    expect(byId["s-fisio"].payment_hours).toBe(1.5);
  });

  it("sem mudança de duração, nenhum recompute por sessão", async () => {
    const { result } = renderHook(() => useUpdateAllOccurrences(), { wrapper });
    result.current.mutate({ templateId: "tpl-1", updates: { capacity: 15 } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const recomputes = updateCalls.filter(
      (c) => c.table === "sessions" && c.filters.some(([, col]) => col === "id"),
    );
    expect(recomputes).toHaveLength(0);
  });
});

describe("useUpdateThisAndFollowing — paga é intocável", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    deleteCalls.length = 0;
    insertCalls.length = 0;
    FUTURE_SESSIONS = [{ id: "s-futura" }];
  });

  it("o delete das futuras filtra is_paid=false (paga NUNCA some)", async () => {
    const { result } = renderHook(() => useUpdateThisAndFollowing(), { wrapper });
    result.current.mutate({
      session: { id: "s-1", template_id: "tpl-1", session_date: "2026-08-10" } as never,
      updates: { duration_minutes: 90 },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const sessionDeletes = deleteCalls.filter((c) => c.table === "sessions");
    expect(sessionDeletes).toHaveLength(1);
    expect(sessionDeletes[0].filters.some(([m, col]) => m === "in" && col === "id")).toBe(true);
  });
});

describe("useCreateSession — INSERT carrega os campos novos", () => {
  beforeEach(() => {
    insertCalls.length = 0;
  });

  it("service_type_id e payment_rate_basis chegam ao banco", async () => {
    const { result } = renderHook(() => useCreateSession(), { wrapper });
    result.current.mutate({
      session_type: "personal",
      session_date: "2026-08-10",
      start_time: "09:00",
      duration_minutes: 30,
      modality: "personal",
      capacity: 1,
      trainer_id: "t-ceniz",
      service_type_id: "s-fisio",
      trainer_hourly_rate_cents: 10800,
      payment_hours: 0.5,
      payment_amount_cents: 10800,
      payment_rate_basis: "per_session",
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(insertCalls).toHaveLength(1);
    const row = insertCalls[0].data as Record<string, unknown>;
    expect(row.service_type_id).toBe("s-fisio");
    expect(row.payment_rate_basis).toBe("per_session");
    expect(row.payment_amount_cents).toBe(10800);
  });

  it("sem os campos: defaults null (sessão sem treinador)", async () => {
    const { result } = renderHook(() => useCreateSession(), { wrapper });
    result.current.mutate({
      session_date: "2026-08-10",
      start_time: "09:00",
      duration_minutes: 60,
      modality: "flow",
      capacity: 12,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const row = insertCalls[0].data as Record<string, unknown>;
    expect(row.service_type_id).toBeNull();
    expect(row.payment_rate_basis).toBeNull();
  });
});
