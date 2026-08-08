import { describe, expect, it } from "vitest";
import { centsToReal, realToCents } from "./money";

describe("realToCents — os dois hábitos de digitação", () => {
  it("vírgula decimal brasileira", () => {
    expect(realToCents("75,00")).toBe(7500);
    expect(realToCents("75,5")).toBe(7550);
    expect(realToCents("45")).toBe(4500);
  });

  it("ponto de milhar COM vírgula decimal", () => {
    expect(realToCents("1.234,56")).toBe(123456);
  });

  // A armadilha real: "75.00" digitado com ponto decimal NÃO pode virar
  // R$ 7.500,00 (interpretação de milhar) — é dinheiro de folha.
  it("ponto decimal sem vírgula é decimal, não milhar", () => {
    expect(realToCents("75.00")).toBe(7500);
    expect(realToCents("75.5")).toBe(7550);
  });

  it("vazio e lixo viram NaN (o chamador aborta), zero é parse válido", () => {
    expect(realToCents("")).toBeNaN();
    expect(realToCents("   ")).toBeNaN();
    expect(realToCents("abc")).toBeNaN();
    expect(realToCents("0")).toBe(0);
  });
});

describe("centsToReal", () => {
  it("formata com vírgula", () => {
    expect(centsToReal(7500)).toBe("75,00");
    expect(centsToReal(4550)).toBe("45,50");
  });
});
