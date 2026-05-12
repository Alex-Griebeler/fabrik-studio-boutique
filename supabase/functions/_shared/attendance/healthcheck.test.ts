import { describe, expect, it } from "vitest";
import {
  classifyHealthcheckResult,
  decideAlertEscalation,
  nextConsecutiveFailures,
  parseConfigInt,
} from "./healthcheck";

describe("classifyHealthcheckResult", () => {
  it("delivered/read → ok", () => {
    expect(classifyHealthcheckResult("delivered")).toBe("ok");
    expect(classifyHealthcheckResult("DELIVERED")).toBe("ok");
    expect(classifyHealthcheckResult("read")).toBe("ok");
  });

  it("failed/undelivered → failed", () => {
    expect(classifyHealthcheckResult("failed")).toBe("failed");
    expect(classifyHealthcheckResult("undelivered")).toBe("failed");
  });

  it("queued/accepted/sending/sent/scheduled → pending", () => {
    expect(classifyHealthcheckResult("queued")).toBe("pending");
    expect(classifyHealthcheckResult("accepted")).toBe("pending");
    expect(classifyHealthcheckResult("sending")).toBe("pending");
    expect(classifyHealthcheckResult("sent")).toBe("pending");
    expect(classifyHealthcheckResult("scheduled")).toBe("pending");
  });

  it("null/undefined/desconhecido → pending (conservador)", () => {
    expect(classifyHealthcheckResult(null)).toBe("pending");
    expect(classifyHealthcheckResult(undefined)).toBe("pending");
    expect(classifyHealthcheckResult("")).toBe("pending");
    expect(classifyHealthcheckResult("alguma_coisa_nova")).toBe("pending");
  });
});

describe("decideAlertEscalation", () => {
  it("alerta quando atinge threshold exato", () => {
    expect(
      decideAlertEscalation({ consecutiveFailures: 2, threshold: 2 }),
    ).toEqual({ shouldAlert: true });
  });

  it("alerta quando ultrapassa threshold", () => {
    expect(
      decideAlertEscalation({ consecutiveFailures: 5, threshold: 2 }),
    ).toEqual({ shouldAlert: true });
  });

  it("não alerta quando abaixo do threshold", () => {
    expect(
      decideAlertEscalation({ consecutiveFailures: 1, threshold: 2 }),
    ).toEqual({ shouldAlert: false });
  });

  it("não alerta com 0 falhas", () => {
    expect(
      decideAlertEscalation({ consecutiveFailures: 0, threshold: 2 }),
    ).toEqual({ shouldAlert: false });
  });

  it("threshold ≤0 vira 1 (defensivo — alerta no primeiro fail)", () => {
    expect(
      decideAlertEscalation({ consecutiveFailures: 1, threshold: 0 }),
    ).toEqual({ shouldAlert: true });
    expect(
      decideAlertEscalation({ consecutiveFailures: 1, threshold: -3 }),
    ).toEqual({ shouldAlert: true });
  });

  it("threshold fracionário trunca pra inteiro", () => {
    expect(
      decideAlertEscalation({ consecutiveFailures: 2, threshold: 2.7 }),
    ).toEqual({ shouldAlert: true });
  });
});

describe("nextConsecutiveFailures", () => {
  it("ok zera o contador", () => {
    expect(nextConsecutiveFailures({ current: 5, outcome: "ok" })).toBe(0);
    expect(nextConsecutiveFailures({ current: 0, outcome: "ok" })).toBe(0);
  });

  it("failed incrementa em 1", () => {
    expect(nextConsecutiveFailures({ current: 0, outcome: "failed" })).toBe(1);
    expect(nextConsecutiveFailures({ current: 3, outcome: "failed" })).toBe(4);
  });

  it("pending não muda (sem info nova)", () => {
    expect(nextConsecutiveFailures({ current: 2, outcome: "pending" })).toBe(2);
    expect(nextConsecutiveFailures({ current: 0, outcome: "pending" })).toBe(0);
  });

  it("clamp pra current negativo (defensivo)", () => {
    expect(nextConsecutiveFailures({ current: -5, outcome: "failed" })).toBe(1);
    expect(nextConsecutiveFailures({ current: -1, outcome: "pending" })).toBe(0);
  });
});

describe("parseConfigInt", () => {
  it("parseia integer válido", () => {
    expect(parseConfigInt("3", 1)).toBe(3);
    expect(parseConfigInt("0", 99)).toBe(0);
    expect(parseConfigInt("-2", 0)).toBe(-2);
  });

  it("usa fallback pra null/undefined/vazio", () => {
    expect(parseConfigInt(null, 7)).toBe(7);
    expect(parseConfigInt(undefined, 7)).toBe(7);
    expect(parseConfigInt("", 7)).toBe(7);
  });

  it("usa fallback pra string não-numérica", () => {
    expect(parseConfigInt("abc", 5)).toBe(5);
    expect(parseConfigInt("not-a-number", 0)).toBe(0);
  });

  it("aceita prefixo numérico (parseInt comportamento padrão)", () => {
    // parseInt("3abc") = 3 — comportamento documentado
    expect(parseConfigInt("3abc", 0)).toBe(3);
  });
});
