import { describe, expect, it } from "vitest";
import { canonicalOfxType, ofxTypeDivergesFromSign } from "./ofxTransactionType";

describe("canonicalOfxType — regressão das 91 despesas-lixo de 04/03/2026", () => {
  // Cada caso abaixo virou DESPESA em produção por causa do bug.
  it("depósito em dinheiro (DEP, +10.000,00) é CRÉDITO, não despesa", () => {
    expect(canonicalOfxType("DEP", 10000)).toBe("CREDIT");
  });

  it("PIX recebido (+1.400,00) é CRÉDITO mesmo com TRNTYPE genérico", () => {
    expect(canonicalOfxType("XFER", 1400)).toBe("CREDIT");
    expect(canonicalOfxType("OTHER", 1400)).toBe("CREDIT");
  });

  it("estorno de débito (+3.296,84) é CRÉDITO", () => {
    expect(canonicalOfxType("CREDIT", 3296.84)).toBe("CREDIT");
    expect(canonicalOfxType("ADJUSTMENT", 3296.84)).toBe("CREDIT");
  });

  it("devolução de juros (+15,34) é CRÉDITO", () => {
    expect(canonicalOfxType("INT", 15.34)).toBe("CREDIT");
  });

  it("qualquer TRNTYPE desconhecido com valor positivo é CRÉDITO", () => {
    for (const t of ["POS", "ATM", "FEE", "SRVCHG", "PAYMENT", "", "LIXO"]) {
      expect(canonicalOfxType(t, 500)).toBe("CREDIT");
    }
  });
});

describe("canonicalOfxType — saídas continuam débito", () => {
  it("PIX enviado (-938,00) é DÉBITO", () => {
    expect(canonicalOfxType("XFER", -938)).toBe("DEBIT");
  });

  it("tarifa e IOF negativos são DÉBITO", () => {
    expect(canonicalOfxType("FEE", -81.4)).toBe("DEBIT");
    expect(canonicalOfxType("SRVCHG", -3.98)).toBe("DEBIT");
  });

  it("TRNTYPE=CREDIT com valor NEGATIVO é DÉBITO (sinal manda)", () => {
    expect(canonicalOfxType("CREDIT", -100)).toBe("DEBIT");
  });

  it("TRNTYPE=DEBIT com valor POSITIVO é CRÉDITO (sinal manda)", () => {
    expect(canonicalOfxType("DEBIT", 100)).toBe("CREDIT");
  });
});

describe("canonicalOfxType — empates e entradas inválidas", () => {
  it("valor zero cai no TRNTYPE declarado", () => {
    expect(canonicalOfxType("DEP", 0)).toBe("CREDIT");
    expect(canonicalOfxType("FEE", 0)).toBe("DEBIT");
    expect(canonicalOfxType(null, 0)).toBe("DEBIT");
  });

  it("valor não-finito não quebra e cai no declarado", () => {
    expect(canonicalOfxType("DEP", Number.NaN)).toBe("CREDIT");
    expect(canonicalOfxType("FEE", Number.NaN)).toBe("DEBIT");
  });

  it("é insensível a caixa e espaços no TRNTYPE", () => {
    expect(canonicalOfxType("  dep  ", 0)).toBe("CREDIT");
  });
});

describe("ofxTypeDivergesFromSign — observabilidade", () => {
  it("acusa o padrão exato que gerou o lixo (DEP positivo lido como débito)", () => {
    expect(ofxTypeDivergesFromSign("XFER", 1400)).toBe(true);
    expect(ofxTypeDivergesFromSign("FEE", 500)).toBe(true);
  });

  it("não acusa quando declarado e sinal concordam", () => {
    expect(ofxTypeDivergesFromSign("DEP", 10000)).toBe(false);
    expect(ofxTypeDivergesFromSign("FEE", -81.4)).toBe(false);
  });

  it("não acusa em valor zero, não-finito ou TRNTYPE vazio", () => {
    expect(ofxTypeDivergesFromSign("DEP", 0)).toBe(false);
    expect(ofxTypeDivergesFromSign("DEP", Number.NaN)).toBe(false);
    expect(ofxTypeDivergesFromSign("", 1400)).toBe(false);
  });
});
