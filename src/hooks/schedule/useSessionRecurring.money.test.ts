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
let ROW_UPDATE_ERROR_FOR: string | null = null;
let TEMPLATE_EXISTS = false;
const updateCalls: Array<{ table: string; data: Row; filters: Array<[string, string, unknown]> }> = [];
const deleteCalls: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];
const insertCalls: Array<{ table: string; data: Row }> = [];
const selectCalls: Array<{ table: string; cols: string; filters: Array<[string, string, unknown]> }> = [];
const opSequence: string[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const makeBuilder = (table: string, op: string, data?: Row) => {
    const filters: Array<[string, string, unknown]> = [];
    const b: Record<string, unknown> = {};
    const record = (method: string) => (col: string, val: unknown) => {
      filters.push([method, col, val]);
      return b;
    };
    b.eq = record("eq");
    b.is = record("is");
    b.gte = record("gte");
    b.in = record("in");
    b.single = () =>
      Promise.resolve({ data: { id: "tpl-1", modality: "flow", day_of_week: 1, start_time: "07:00", duration_minutes: 60, capacity: 12, instructor_id: null, location: null, recurrence_end: null }, error: null });
    b.then = (resolve: (v: unknown) => void) => {
      if (op === "update") {
        opSequence.push(`update:${table}`);
        updateCalls.push({ table, data: data!, filters });
        const idFilter = filters.find(([m, col]) => m === "eq" && col === "id");
        if (idFilter && ROW_UPDATE_ERROR_FOR === idFilter[2]) {
          return resolve({ error: { message: "row update failed" } });
        }
      }
      if (op === "delete") {
        opSequence.push(`delete:${table}`);
        deleteCalls.push({ table, filters });
      }
      if (op === "select") {
        selectCalls.push({ table, cols: String(data?.cols ?? ""), filters });
        // checagem de existência do template novo
        if (table === "class_templates")
          return resolve({ data: TEMPLATE_EXISTS ? [{ id: "tpl-novo" }] : [], error: null });
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
          opSequence.push(`insert:${table}`);
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
    selectCalls.length = 0;
    opSequence.length = 0;
    ROW_UPDATE_ERROR_FOR = null;
    AFFECTED_SESSIONS = [
      { id: "s-hourly", trainer_hourly_rate_cents: 10000, payment_rate_basis: "hourly" },
      { id: "s-legada", trainer_hourly_rate_cents: 12000, payment_rate_basis: null },
      { id: "s-fisio", trainer_hourly_rate_cents: 10800, payment_rate_basis: "per_session" },
    ];
  });

  it("duração nova: UMA escrita por sessão com estrutura+dinheiro juntos e CAS is_paid", async () => {
    const { result } = renderHook(() => useUpdateAllOccurrences(), { wrapper });
    result.current.mutate({ templateId: "tpl-1", updates: { duration_minutes: 90 } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const perRow = updateCalls.filter(
      (c) => c.table === "sessions" && c.filters.some(([m, col]) => m === "eq" && col === "id"),
    );
    expect(perRow).toHaveLength(3);
    // NENHUM lote estrutural separado quando há dinheiro em jogo — a
    // escrita é única por sessão (estrutura + valor no mesmo UPDATE):
    const bulk = updateCalls.find(
      (c) => c.table === "sessions" && c.filters.some(([, col]) => col === "template_id"),
    );
    expect(bulk).toBeUndefined();

    const byId = Object.fromEntries(
      perRow.map((c) => [c.filters.find(([, col]) => col === "id")![2] as string, c.data]),
    );
    // estrutura viaja junto:
    expect(byId["s-hourly"].duration_minutes).toBe(90);
    expect(byId["s-hourly"].payment_amount_cents).toBe(15000); // 1,5h × 100/h
    expect(byId["s-hourly"].payment_hours).toBe(1.5);
    expect(byId["s-legada"].payment_amount_cents).toBe(18000); // base null = hourly implícito
    expect(byId["s-fisio"]).not.toHaveProperty("payment_amount_cents"); // cravado
    expect(byId["s-fisio"].payment_hours).toBe(1.5);
    // CAS por linha: sessão que virou paga entre SELECT e UPDATE fica
    // intacta por inteiro (0 linhas), nunca meio-a-meio:
    for (const c of perRow) {
      expect(c.filters).toContainEqual(["eq", "is_paid", false]);
    }
    // e a seleção do recompute também filtra pagas:
    const recomputeSelect = selectCalls.find(
      (c) => c.table === "sessions" && c.cols.includes("payment_rate_basis"),
    );
    expect(recomputeSelect?.filters).toContainEqual(["eq", "is_paid", false]);
  });

  it("falha em UM recompute vira ERRO da mutação (nunca sucesso parcial mudo)", async () => {
    ROW_UPDATE_ERROR_FOR = "s-legada";
    const { result } = renderHook(() => useUpdateAllOccurrences(), { wrapper });
    result.current.mutate({ templateId: "tpl-1", updates: { duration_minutes: 90 } });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("sem mudança de duração: lote estrutural (com is_paid=false), zero por-sessão", async () => {
    const { result } = renderHook(() => useUpdateAllOccurrences(), { wrapper });
    result.current.mutate({ templateId: "tpl-1", updates: { capacity: 15 } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const perRow = updateCalls.filter(
      (c) => c.table === "sessions" && c.filters.some(([, col]) => col === "id"),
    );
    expect(perRow).toHaveLength(0);
    const bulk = updateCalls.find(
      (c) => c.table === "sessions" && c.filters.some(([, col]) => col === "template_id"),
    );
    expect(bulk?.filters).toContainEqual(["eq", "is_paid", false]);
  });
});

describe("useUpdateThisAndFollowing — paga é intocável", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    deleteCalls.length = 0;
    insertCalls.length = 0;
    selectCalls.length = 0;
    opSequence.length = 0;
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
    // a SELEÇÃO das futuras exigiu is_paid=false — provado no filtro:
    const futSelect = selectCalls.find((c) => c.table === "sessions");
    expect(futSelect?.filters).toContainEqual(["eq", "is_paid", false]);
  });

  it("ORDEM de retry seguro: delete das futuras ANTES do insert do template novo", async () => {
    const { result } = renderHook(() => useUpdateThisAndFollowing(), { wrapper });
    result.current.mutate({
      session: { id: "s-1", template_id: "tpl-1", session_date: "2026-08-10" } as never,
      updates: { duration_minutes: 90 },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const delIdx = opSequence.indexOf("delete:sessions");
    const insIdx = opSequence.indexOf("insert:class_templates");
    const truncIdx = opSequence.indexOf("update:class_templates");
    expect(delIdx).toBeGreaterThanOrEqual(0);
    expect(insIdx).toBeGreaterThan(delIdx); // delete vem antes do insert
    expect(truncIdx).toBeGreaterThan(insIdx); // truncar o antigo é o ÚLTIMO
    // e a checagem de existência usa a ASSINATURA COMPLETA (não colide
    // com outra turma legítima no mesmo dia/horário):
    const existsCheck = selectCalls.find((c) => c.table === "class_templates");
    const cols = (existsCheck?.filters ?? []).map(([, col]) => col);
    for (const required of [
      "day_of_week",
      "start_time",
      "recurrence_start",
      "modality",
      "duration_minutes",
      "capacity",
      "instructor_id",
      "is_active",
    ]) {
      expect(cols).toContain(required);
    }
  });

  it("template novo JÁ existe (retry pós-falha): não duplica a série", async () => {
    // o mock devolve [] por padrão; força existência via override local:
    const origSelect = selectCalls.length; // marcador
    void origSelect;
    // simula existência: intercepta redefinindo o comportamento padrão
    // (o builder consulta class_templates → devolvemos um registro)
    TEMPLATE_EXISTS = true;
    const { result } = renderHook(() => useUpdateThisAndFollowing(), { wrapper });
    result.current.mutate({
      session: { id: "s-1", template_id: "tpl-1", session_date: "2026-08-10" } as never,
      updates: { duration_minutes: 90 },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(opSequence).not.toContain("insert:class_templates");
    TEMPLATE_EXISTS = false;
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
