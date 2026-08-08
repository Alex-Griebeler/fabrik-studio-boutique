// Testes dos hooks de tarifas por serviço (PR-B). O contrato que importa:
// - salvar RELÊ os pares no servidor antes do upsert e aborta em conflito
//   (RateConflictError) — cache local desatualizado NÃO sobrescreve
// - o upsert é UM statement em lote (atômico), SEM ignoreDuplicates
// - aplicar padrão é upsert COM ignoreDuplicates (nunca sobrescreve)
// - remover é compare-and-swap: 0 linhas removidas = conflito
// - a leitura estoura ERRO no teto de 1000 (nunca truncamento mudo)
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const upsertCalls: Array<{ rows: unknown; options: unknown }> = [];
let FAKE_RATES: Array<Record<string, unknown>> = [];
let SERVER_PAIRS: Array<Record<string, unknown>> = [];
let DELETED_ROWS: Array<Record<string, unknown>> = [];

vi.mock("@/integrations/supabase/client", () => {
  const from = (_table: string) => ({
    select: () => ({
      // caminho da leitura paginada (order → limit)
      order: () => ({
        limit: () => Promise.resolve({ data: FAKE_RATES, error: null }),
      }),
      // caminho do pré-flight do save (in)
      in: () => Promise.resolve({ data: SERVER_PAIRS, error: null }),
      eq: () => Promise.resolve({ data: FAKE_RATES, error: null }),
    }),
    upsert: (rows: unknown, options: unknown) => {
      upsertCalls.push({ rows, options });
      return Promise.resolve({ error: null });
    },
    delete: () => ({
      eq: () => ({
        eq: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: DELETED_ROWS, error: null }),
          }),
        }),
      }),
    }),
  });
  return { supabase: { from } };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  useSaveTrainerServiceRates,
  useApplyDefaultRates,
  useDeleteTrainerServiceRate,
  useTrainerServiceRates,
  RateConflictError,
} from "./useServiceRates";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

const ROWS = [
  {
    trainer_id: "t1",
    service_type_id: "s1",
    rate_basis: "hourly" as const,
    rate_cents: 7500,
  },
  {
    trainer_id: "t2",
    service_type_id: "s1",
    rate_basis: "per_session" as const,
    rate_cents: 4500,
  },
];

// Baselines coerentes com um servidor onde t1|s1 já existe a 7000/hourly
// e t2|s1 ainda não existe.
const BASELINES = {
  "t1|s1": { cents: 7000, basis: "hourly" as const },
  "t2|s1": null,
};

describe("useSaveTrainerServiceRates — pré-flight + salvamento atômico", () => {
  beforeEach(() => {
    upsertCalls.length = 0;
    SERVER_PAIRS = [
      { trainer_id: "t1", service_type_id: "s1", rate_basis: "hourly", rate_cents: 7000 },
    ];
  });

  it("servidor igual às baselines → um ÚNICO upsert com o lote inteiro", async () => {
    const { result } = renderHook(() => useSaveTrainerServiceRates(), { wrapper });
    result.current.mutate({ rows: ROWS, baselines: BASELINES });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].rows).toEqual(ROWS);
    expect(upsertCalls[0].options).toMatchObject({
      onConflict: "trainer_id,service_type_id",
    });
    // Salvar EDITA célula existente: ignoreDuplicates aqui seria um save
    // que silenciosamente não salva.
    expect(
      (upsertCalls[0].options as { ignoreDuplicates?: boolean }).ignoreDuplicates,
    ).not.toBe(true);
  });

  it("servidor mudou (valor diferente) → RateConflictError e ZERO upsert", async () => {
    SERVER_PAIRS = [
      { trainer_id: "t1", service_type_id: "s1", rate_basis: "hourly", rate_cents: 9999 },
    ];
    const { result } = renderHook(() => useSaveTrainerServiceRates(), { wrapper });
    result.current.mutate({ rows: ROWS, baselines: BASELINES });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(RateConflictError);
    expect((result.current.error as RateConflictError).keys).toEqual(["t1|s1"]);
    expect(upsertCalls).toHaveLength(0);
  });

  it("célula que o usuário via VAZIA foi criada por outro → conflito", async () => {
    SERVER_PAIRS = [
      { trainer_id: "t1", service_type_id: "s1", rate_basis: "hourly", rate_cents: 7000 },
      { trainer_id: "t2", service_type_id: "s1", rate_basis: "hourly", rate_cents: 5000 },
    ];
    const { result } = renderHook(() => useSaveTrainerServiceRates(), { wrapper });
    result.current.mutate({ rows: ROWS, baselines: BASELINES });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as RateConflictError).keys).toEqual(["t2|s1"]);
    expect(upsertCalls).toHaveLength(0);
  });

  it("lote vazio não toca o banco", async () => {
    const { result } = renderHook(() => useSaveTrainerServiceRates(), { wrapper });
    result.current.mutate({ rows: [], baselines: {} });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(upsertCalls).toHaveLength(0);
  });
});

describe("useApplyDefaultRates — padrão nunca sobrescreve", () => {
  beforeEach(() => {
    upsertCalls.length = 0;
  });

  it("upsert com ignoreDuplicates=true (ON CONFLICT DO NOTHING)", async () => {
    const { result } = renderHook(() => useApplyDefaultRates(), { wrapper });
    result.current.mutate(ROWS);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].options).toMatchObject({
      onConflict: "trainer_id,service_type_id",
      ignoreDuplicates: true,
    });
  });
});

describe("useDeleteTrainerServiceRate — compare-and-swap", () => {
  it("remoção confirmada quando o registro ainda é o que o usuário viu", async () => {
    DELETED_ROWS = [{ id: "r1" }];
    const { result } = renderHook(() => useDeleteTrainerServiceRate(), { wrapper });
    result.current.mutate({ id: "r1", expectedCents: 10000, expectedBasis: "hourly" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("0 linhas removidas (mudou por baixo) → RateConflictError", async () => {
    DELETED_ROWS = [];
    const { result } = renderHook(() => useDeleteTrainerServiceRate(), { wrapper });
    result.current.mutate({ id: "r1", expectedCents: 10000, expectedBasis: "hourly" });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(RateConflictError);
  });
});

describe("useTrainerServiceRates — teto explícito", () => {
  it("1000+ linhas vira erro visível, não truncamento", async () => {
    FAKE_RATES = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}` }));
    const { result } = renderHook(() => useTrainerServiceRates(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
