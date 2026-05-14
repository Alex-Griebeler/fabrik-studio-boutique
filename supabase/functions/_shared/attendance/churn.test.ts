import { describe, it, expect } from "vitest";
import {
  completeWeeks,
  evaluateAllChurn,
  evaluateChurnRisk,
  mondayOf,
  type ChurnEvaluationOptions,
  type ChurnEvent,
} from "./churn";

// Opções base — janelas pequenas, fáceis de raciocinar nos testes.
const baseOpts: ChurnEvaluationOptions = {
  dataStart: "2026-03-02", // segunda
  dataEnd: "2026-04-26", // domingo — 8 semanas completas
  recentWeeks: 2,
  baselineWeeks: 8,
  minBaselineWeeks: 4,
  dropThresholdPct: 0.4,
  provisionalDropThresholdPct: 0.6,
};

/** Gera N eventos de presença numa data. */
function presences(date: string, n: number): ChurnEvent[] {
  return Array.from({ length: n }, () => ({
    occurredDate: date,
    isPresence: true,
  }));
}

describe("mondayOf", () => {
  it("retorna a própria data quando já é segunda", () => {
    expect(mondayOf("2026-03-02")).toBe("2026-03-02");
  });

  it("volta pra segunda a partir de qualquer dia da semana", () => {
    expect(mondayOf("2026-03-04")).toBe("2026-03-02"); // quarta
    expect(mondayOf("2026-03-07")).toBe("2026-03-02"); // sábado
    expect(mondayOf("2026-03-08")).toBe("2026-03-02"); // domingo → mesma semana ISO
    expect(mondayOf("2026-03-09")).toBe("2026-03-09"); // segunda seguinte
  });
});

describe("completeWeeks", () => {
  it("lista só semanas com segunda E domingo dentro do range", () => {
    // range exato de 1 semana
    expect(completeWeeks("2026-03-02", "2026-03-08")).toEqual(["2026-03-02"]);
  });

  it("descarta semana parcial na borda inicial", () => {
    // começa numa quarta → a semana de 02/03 é parcial, fica de fora
    expect(completeWeeks("2026-03-04", "2026-03-15")).toEqual(["2026-03-09"]);
  });

  it("descarta semana parcial na borda final", () => {
    // termina numa quinta → a semana de 09/03 é parcial, fica de fora
    expect(completeWeeks("2026-03-02", "2026-03-12")).toEqual(["2026-03-02"]);
  });

  it("conta 8 semanas no range base", () => {
    expect(completeWeeks(baseOpts.dataStart, baseOpts.dataEnd)).toHaveLength(8);
  });

  it("retorna vazio quando o range não cobre nenhuma semana completa", () => {
    expect(completeWeeks("2026-03-04", "2026-03-06")).toEqual([]);
    expect(completeWeeks("2026-03-10", "2026-03-02")).toEqual([]); // end < start
  });
});

describe("evaluateChurnRisk — risco real", () => {
  it("dispara quando a frequência recente cai abaixo do threshold (full)", () => {
    // baseline (6 semanas) ~3/sem, recente (2 semanas) ~1/sem → queda ~67%
    const weeks = completeWeeks(baseOpts.dataStart, baseOpts.dataEnd);
    const events: ChurnEvent[] = [];
    for (const w of weeks.slice(0, 6)) events.push(...presences(w, 3));
    for (const w of weeks.slice(6)) events.push(...presences(w, 1));

    const r = evaluateChurnRisk("stu-1", events, baseOpts);
    expect(r.churnRisk).toBe(true);
    expect(r.confidence).toBe("full");
    expect(r.baselineWeeksUsed).toBe(6);
    expect(r.recentWeeksUsed).toBe(2);
    expect(r.dropPct).toBeCloseTo(2 / 3, 5);
    expect(r.thresholdApplied).toBe(0.4);
  });

  it("NÃO dispara quando a queda fica abaixo do threshold", () => {
    // baseline ~3/sem, recente ~2/sem → queda ~33% < 40%
    const weeks = completeWeeks(baseOpts.dataStart, baseOpts.dataEnd);
    const events: ChurnEvent[] = [];
    for (const w of weeks.slice(0, 6)) events.push(...presences(w, 3));
    for (const w of weeks.slice(6)) events.push(...presences(w, 2));

    const r = evaluateChurnRisk("stu-1", events, baseOpts);
    expect(r.churnRisk).toBe(false);
    expect(r.confidence).toBe("full");
    expect(r.dropPct).toBeCloseTo(1 / 3, 5);
  });

  it("aluno estável não dispara (queda ~0)", () => {
    const weeks = completeWeeks(baseOpts.dataStart, baseOpts.dataEnd);
    const events = weeks.flatMap((w) => presences(w, 3));
    const r = evaluateChurnRisk("stu-1", events, baseOpts);
    expect(r.churnRisk).toBe(false);
    expect(r.dropPct).toBeCloseTo(0, 5);
  });

  it("aluno que aumentou frequência tem dropPct negativo e não dispara", () => {
    const weeks = completeWeeks(baseOpts.dataStart, baseOpts.dataEnd);
    const events: ChurnEvent[] = [];
    for (const w of weeks.slice(0, 6)) events.push(...presences(w, 1));
    for (const w of weeks.slice(6)) events.push(...presences(w, 3));
    const r = evaluateChurnRisk("stu-1", events, baseOpts);
    expect(r.churnRisk).toBe(false);
    expect(r.dropPct! < 0).toBe(true);
  });
});

describe("evaluateChurnRisk — baseline curto (provisional)", () => {
  // Range de 3 semanas completas: 1 recente + 2 baseline < minBaselineWeeks(4).
  const shortOpts: ChurnEvaluationOptions = {
    ...baseOpts,
    dataStart: "2026-03-02",
    dataEnd: "2026-03-22", // 3 semanas completas
    recentWeeks: 1,
  };

  it("marca provisional quando baseline < minBaselineWeeks", () => {
    const weeks = completeWeeks(shortOpts.dataStart, shortOpts.dataEnd);
    expect(weeks).toHaveLength(3);
    const events: ChurnEvent[] = [];
    for (const w of weeks.slice(0, 2)) events.push(...presences(w, 3));
    // semana recente: 1 presença → queda 67%
    events.push(...presences(weeks[2], 1));

    const r = evaluateChurnRisk("stu-1", events, shortOpts);
    expect(r.confidence).toBe("provisional");
    expect(r.thresholdApplied).toBe(0.6);
    expect(r.churnRisk).toBe(true); // 67% >= 60%
  });

  it("provisional NÃO dispara com queda que passaria no threshold full", () => {
    // queda de 50%: passaria em full (40%) mas não em provisional (60%)
    const weeks = completeWeeks(shortOpts.dataStart, shortOpts.dataEnd);
    const events: ChurnEvent[] = [];
    for (const w of weeks.slice(0, 2)) events.push(...presences(w, 4));
    events.push(...presences(weeks[2], 2)); // 4→2 = queda 50%

    const r = evaluateChurnRisk("stu-1", events, shortOpts);
    expect(r.confidence).toBe("provisional");
    expect(r.dropPct).toBeCloseTo(0.5, 5);
    expect(r.churnRisk).toBe(false);
  });
});

describe("evaluateChurnRisk — casos insufficient", () => {
  it("aluno novo sem baseline (só presença na semana recente) → insufficient", () => {
    const weeks = completeWeeks(baseOpts.dataStart, baseOpts.dataEnd);
    const events = weeks.slice(6).flatMap((w) => presences(w, 3));
    const r = evaluateChurnRisk("stu-novo", events, baseOpts);
    expect(r.confidence).toBe("insufficient");
    expect(r.churnRisk).toBe(false);
    expect(r.detail).toContain("baseline");
  });

  it("histórico curto demais pra formar recente + baseline → insufficient", () => {
    // só 2 semanas completas, recentWeeks 2 → 0 baseline
    const opts: ChurnEvaluationOptions = {
      ...baseOpts,
      dataStart: "2026-03-02",
      dataEnd: "2026-03-15",
    };
    const weeks = completeWeeks(opts.dataStart, opts.dataEnd);
    const events = weeks.flatMap((w) => presences(w, 3));
    const r = evaluateChurnRisk("stu-1", events, opts);
    expect(r.confidence).toBe("insufficient");
    expect(r.detail).toContain("insuficiente");
  });

  it("aluno sem nenhuma presença → insufficient (não divide por zero)", () => {
    const r = evaluateChurnRisk("stu-1", [], baseOpts);
    expect(r.confidence).toBe("insufficient");
    expect(r.churnRisk).toBe(false);
    expect(r.dropPct).toBeNull();
  });

  it("eventos não-presença (no_show) não contam como frequência", () => {
    const weeks = completeWeeks(baseOpts.dataStart, baseOpts.dataEnd);
    const events: ChurnEvent[] = weeks.flatMap((w) => [
      { occurredDate: w, isPresence: false },
      { occurredDate: w, isPresence: false },
    ]);
    const r = evaluateChurnRisk("stu-1", events, baseOpts);
    // zero presenças em tudo → baseline avg 0 → insufficient
    expect(r.confidence).toBe("insufficient");
    expect(r.detail).toContain("baseline");
  });

  it("config de janelas inválida → insufficient", () => {
    const r = evaluateChurnRisk("stu-1", presences("2026-03-02", 3), {
      ...baseOpts,
      recentWeeks: 0,
    });
    expect(r.confidence).toBe("insufficient");
    expect(r.detail).toContain("configuração");
  });
});

describe("evaluateChurnRisk — bordas de semana parcial", () => {
  it("ignora presenças em semanas parciais nas bordas do range", () => {
    // Dados de quarta a quinta da semana seguinte: só a semana do meio
    // é completa. recentWeeks 1 + baseline 1 não existe → insufficient,
    // mas o ponto é que as presenças das bordas não inflam nada.
    const opts: ChurnEvaluationOptions = {
      ...baseOpts,
      dataStart: "2026-03-04", // quarta
      dataEnd: "2026-03-19", // quinta da semana +2
      recentWeeks: 1,
    };
    // 1 semana completa (09/03). Presenças nas bordas parciais + na completa.
    const events: ChurnEvent[] = [
      ...presences("2026-03-05", 5), // semana parcial inicial — ignorada
      ...presences("2026-03-10", 3), // semana completa
      ...presences("2026-03-18", 5), // semana parcial final — ignorada
    ];
    const r = evaluateChurnRisk("stu-1", events, opts);
    // 1 semana completa, recentWeeks 1 → 0 baseline → insufficient
    expect(r.confidence).toBe("insufficient");
  });
});

describe("evaluateAllChurn", () => {
  it("avalia em lote e retorna TODOS os resultados (inclusive sem risco)", () => {
    const weeks = completeWeeks(baseOpts.dataStart, baseOpts.dataEnd);
    const churning: ChurnEvent[] = [];
    for (const w of weeks.slice(0, 6)) churning.push(...presences(w, 3));
    for (const w of weeks.slice(6)) churning.push(...presences(w, 1));
    const stable = weeks.flatMap((w) => presences(w, 3));

    const byStudent = new Map<string, ChurnEvent[]>([
      ["churning", churning],
      ["stable", stable],
      ["empty", []],
    ]);
    const results = evaluateAllChurn(byStudent, baseOpts);
    expect(results).toHaveLength(3);
    expect(results.find((r) => r.studentId === "churning")?.churnRisk).toBe(true);
    expect(results.find((r) => r.studentId === "stable")?.churnRisk).toBe(false);
    expect(results.find((r) => r.studentId === "empty")?.confidence).toBe(
      "insufficient",
    );
  });
});
