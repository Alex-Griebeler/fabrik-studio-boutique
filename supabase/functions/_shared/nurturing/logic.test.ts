import { describe, expect, it } from "vitest";
import {
  isNurturingCronSecret,
  nurturingIdempotencyKey,
  normalizeRequestId,
  parseNurturingRequest,
  renderNurturingMessage,
  timingSafeEqual,
} from "./logic";

describe("parseNurturingRequest", () => {
  it("usa dry-run por padrão", () => {
    expect(parseNurturingRequest({})).toEqual({ dryRun: true, limit: 50 });
    expect(parseNurturingRequest(null)).toEqual({ dryRun: true, limit: 50 });
  });

  it("só desativa dry-run com false explícito", () => {
    expect(parseNurturingRequest({ dryRun: false }).dryRun).toBe(false);
    expect(parseNurturingRequest({ dryRun: 0 }).dryRun).toBe(true);
  });

  it("limita o lote entre 1 e 100", () => {
    expect(parseNurturingRequest({ limit: 0 }).limit).toBe(1);
    expect(parseNurturingRequest({ limit: 20.9 }).limit).toBe(20);
    expect(parseNurturingRequest({ limit: 999 }).limit).toBe(100);
    expect(parseNurturingRequest({ limit: Number.NaN }).limit).toBe(50);
  });
});

describe("normalizeRequestId", () => {
  it("preserva UUID válido e normaliza caixa", () => {
    expect(normalizeRequestId("550E8400-E29B-41D4-A716-446655440000"))
      .toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("gera UUID para valor ausente ou inválido", () => {
    expect(normalizeRequestId(null)).toMatch(/^[0-9a-f-]{36}$/);
    expect(normalizeRequestId("request-livre")).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("nurturingIdempotencyKey", () => {
  it("é determinística por execução e etapa", () => {
    expect(nurturingIdempotencyKey("exec-1", "step-2"))
      .toBe("exec-1:step-2");
  });
});

describe("renderNurturingMessage", () => {
  it("substitui os campos conhecidos sem vazar null", () => {
    expect(renderNurturingMessage(
      "Olá {{lead.name}} — {{lead.phone}} — {{lead.email}}",
      { name: "Ana", phone: null, email: "ana@example.com" },
    )).toBe("Olá Ana —  — ana@example.com");
  });
});

describe("timingSafeEqual", () => {
  it("aceita somente valores idênticos", () => {
    expect(timingSafeEqual("segredo", "segredo")).toBe(true);
    expect(timingSafeEqual("segredo", "segredo2")).toBe(false);
    expect(timingSafeEqual("", "segredo")).toBe(false);
  });
});

describe("isNurturingCronSecret", () => {
  it("aceita apenas o formato de 64 caracteres gerado pela migration", () => {
    expect(isNurturingCronSecret("a".repeat(64))).toBe(true);
    expect(isNurturingCronSecret("A".repeat(64))).toBe(false);
    expect(isNurturingCronSecret("a".repeat(63))).toBe(false);
    expect(isNurturingCronSecret("x".repeat(64))).toBe(false);
  });
});
