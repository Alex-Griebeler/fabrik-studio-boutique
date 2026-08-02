import { describe, expect, it } from "vitest";

import {
  getNextRecurrenceDate,
  isFinanceCronSecret,
  parseFinanceRequest,
  timingSafeEqual,
} from "./logic";

describe("parseFinanceRequest", () => {
  it("só ativa validateOnly com o booleano true explícito", () => {
    expect(parseFinanceRequest({ validateOnly: true }).validateOnly).toBe(true);
  });

  // O default NAO pode inverter: cron e frontend chamam sem o campo e
  // precisam continuar executando de verdade (criterio f).
  it.each([
    ["body vazio", {}],
    ["campo ausente", { mode: "cron" }],
    ["string 'true'", { validateOnly: "true" }],
    ["número 1", { validateOnly: 1 }],
    ["null", { validateOnly: null }],
    ["body não-objeto", "validateOnly"],
    ["array", [{ validateOnly: true }]],
  ])("mantém execução real para %s", (_label, body) => {
    expect(parseFinanceRequest(body).validateOnly).toBe(false);
  });
});

describe("isFinanceCronSecret", () => {
  it("aceita exatamente 64 hex minúsculos", () => {
    expect(isFinanceCronSecret("a".repeat(64))).toBe(true);
    expect(isFinanceCronSecret("0123456789abcdef".repeat(4))).toBe(true);
  });

  it.each([
    ["curto", "a".repeat(63)],
    ["longo", "a".repeat(65)],
    ["maiúsculo", "A".repeat(64)],
    ["não-hex", "z".repeat(64)],
    ["vazio", ""],
  ])("rejeita %s", (_label, value) => {
    expect(isFinanceCronSecret(value)).toBe(false);
  });
});

describe("timingSafeEqual", () => {
  it("compara valores iguais e diferentes", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

// Paridade com o comportamento anterior: a funcao foi movida verbatim de
// daily-finance-cron/index.ts.
describe("getNextRecurrenceDate", () => {
  const base = new Date("2026-01-31T00:00:00.000Z");

  it("soma 7 dias no semanal", () => {
    expect(getNextRecurrenceDate(base, "weekly").toISOString().substring(0, 10))
      .toBe("2026-02-07");
  });

  it("soma 1 ano no anual", () => {
    expect(getNextRecurrenceDate(base, "yearly").toISOString().substring(0, 10))
      .toBe("2027-01-31");
  });

  it("usa mensal como default para frequência desconhecida", () => {
    const unknown = getNextRecurrenceDate(new Date("2026-03-15T00:00:00.000Z"), "quinzenal");
    const monthly = getNextRecurrenceDate(new Date("2026-03-15T00:00:00.000Z"), "monthly");
    expect(unknown.toISOString()).toBe(monthly.toISOString());
  });

  it("não muta a data recebida", () => {
    const input = new Date("2026-05-10T00:00:00.000Z");
    getNextRecurrenceDate(input, "monthly");
    expect(input.toISOString()).toBe("2026-05-10T00:00:00.000Z");
  });
});
