import { describe, expect, it } from "vitest";
import { centsToReal, realToCents } from "./money";

describe("realToCents — parser ESTRITO (dinheiro de folha não tolera ambiguidade)", () => {
  it("aceita dígitos + decimal com vírgula ou ponto (1–2 casas)", () => {
    expect(realToCents("75")).toBe(7500);
    expect(realToCents("75,00")).toBe(7500);
    expect(realToCents("75.00")).toBe(7500);
    expect(realToCents("75,5")).toBe(7550);
    expect(realToCents("1234,56")).toBe(123456);
    expect(realToCents("0")).toBe(0);
  });

  // Separador de milhar é AMBÍGUO ("1.234" = R$1.234,00 ou R$1,234?) e a
  // interpretação errada já gravou centavos errados no dialog legado —
  // aqui ele é REJEITADO, nunca reinterpretado.
  it("rejeita milhar e mais de 2 casas decimais", () => {
    expect(realToCents("1.234")).toBeNaN();
    expect(realToCents("1.234,56")).toBeNaN();
    expect(realToCents("1,234.56")).toBeNaN();
    expect(realToCents("75,005")).toBeNaN();
  });

  it("rejeita vazio, lixo e sinais", () => {
    expect(realToCents("")).toBeNaN();
    expect(realToCents("   ")).toBeNaN();
    expect(realToCents("abc")).toBeNaN();
    expect(realToCents("-75")).toBeNaN();
    expect(realToCents("75,")).toBeNaN();
    expect(realToCents(",50")).toBeNaN();
  });
});

describe("centsToReal", () => {
  it("formata com vírgula", () => {
    expect(centsToReal(7500)).toBe("75,00");
    expect(centsToReal(4550)).toBe("45,50");
    expect(centsToReal(0)).toBe("0,00");
  });
});
