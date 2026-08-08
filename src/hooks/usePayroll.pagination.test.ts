// Teste da paginação da folha (Onda 2d): o `.limit(1000)` silencioso
// truncava a soma — treinador subpago sem erro nenhum. Aqui simulamos
// mais de 1000 sessões e provamos que TODAS entram; e que estourar o
// teto vira ERRO explícito, nunca truncamento mudo.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ── Mock do client Supabase: builder encadeável cujo resultado depende
// do range pedido, alimentado por um "banco" em memória. ──
let FAKE_ROWS: Array<{ id: number }> = [];

vi.mock("@/integrations/supabase/client", () => {
  const makeBuilder = () => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of ["select", "gte", "lte", "in", "order", "eq"]) b[m] = chain;
    b.range = (from: number, to: number) => ({
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: FAKE_ROWS.slice(from, to + 1), error: null }),
    });
    return b;
  };
  return { supabase: { from: () => makeBuilder() } };
});

import { usePayableSessions } from "./usePayroll";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

const FILTERS = { startDate: "2026-08-01", endDate: "2026-08-31" };

describe("usePayableSessions — paginação sem truncamento", () => {
  beforeEach(() => {
    FAKE_ROWS = [];
  });

  it("1.500 sessões: TODAS entram (o antigo limit(1000) perdia 500)", async () => {
    FAKE_ROWS = Array.from({ length: 1500 }, (_, i) => ({ id: i }));
    const { result } = renderHook(() => usePayableSessions(FILTERS), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1500);
  });

  it("exatamente 1.000: uma página cheia + uma vazia, sem duplicar", async () => {
    FAKE_ROWS = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const { result } = renderHook(() => usePayableSessions(FILTERS), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1000);
    const ids = new Set(
      (result.current.data as unknown as Array<{ id: number }>).map((r) => r.id),
    );
    expect(ids.size).toBe(1000);
  });

  it("acima do teto (20 páginas cheias): ERRO explícito, nunca corte mudo", async () => {
    FAKE_ROWS = Array.from({ length: 20001 }, (_, i) => ({ id: i }));
    const { result } = renderHook(() => usePayableSessions(FILTERS), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toMatch(/reduza o intervalo/);
  });

  it("vazio: retorna lista vazia sem erro", async () => {
    const { result } = renderHook(() => usePayableSessions(FILTERS), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
