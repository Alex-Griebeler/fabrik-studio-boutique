// Testes dos hooks de tarifas por serviço (PR-B). O contrato que importa:
// - salvar é UM upsert em lote (atômico) SEM ignoreDuplicates (edita de verdade)
// - aplicar padrão é upsert COM ignoreDuplicates (nunca sobrescreve)
// - a leitura estoura ERRO no teto de 1000 (nunca truncamento mudo)
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const upsertCalls: Array<{ rows: unknown; options: unknown }> = [];
let FAKE_RATES: Array<Record<string, unknown>> = [];

vi.mock("@/integrations/supabase/client", () => {
  const from = (_table: string) => ({
    select: () => ({
      order: () => ({
        limit: () =>
          Promise.resolve({ data: FAKE_RATES, error: null }),
        eq: () => Promise.resolve({ data: FAKE_RATES, error: null }),
      }),
    }),
    upsert: (rows: unknown, options: unknown) => {
      upsertCalls.push({ rows, options });
      return Promise.resolve({ error: null });
    },
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  });
  return { supabase: { from } };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  useSaveTrainerServiceRates,
  useApplyDefaultRates,
  useTrainerServiceRates,
} from "./useServiceRates";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

describe("useSaveTrainerServiceRates — salvamento atômico", () => {
  beforeEach(() => {
    upsertCalls.length = 0;
  });

  it("um ÚNICO upsert com o lote inteiro e onConflict do par", async () => {
    const { result } = renderHook(() => useSaveTrainerServiceRates(), { wrapper });
    result.current.mutate(ROWS);
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

  it("lote vazio não toca o banco", async () => {
    const { result } = renderHook(() => useSaveTrainerServiceRates(), { wrapper });
    result.current.mutate([]);
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

describe("useTrainerServiceRates — teto explícito", () => {
  it("1000+ linhas vira erro visível, não truncamento", async () => {
    FAKE_RATES = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}` }));
    const { result } = renderHook(() => useTrainerServiceRates(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
