import { describe, expect, it } from "vitest";
import {
  contractDueDates,
  installmentDueDate,
  lastDayOfMonth,
  resolvePaymentDay,
} from "./dueDateRule";

describe("regra de vencimento da Fabrik — cada aluna tem o seu dia", () => {
  it("aluna que fechou dia 10/01 vence TODO dia 10 (não escorrega)", () => {
    const dates = contractDueDates({ startDateISO: "2026-01-10", installments: 12 });
    expect(dates).toEqual([
      "2026-01-10", "2026-02-10", "2026-03-10", "2026-04-10",
      "2026-05-10", "2026-06-10", "2026-07-10", "2026-08-10",
      "2026-09-10", "2026-10-10", "2026-11-10", "2026-12-10",
    ]);
  });

  it("REGRESSÃO: o comportamento antigo (somar 30 dias) escorregava — o novo não", () => {
    // Antigo: 10/01 + 30 = 09/02; +60 = 11/03… Novo: sempre dia 10.
    expect(installmentDueDate({ startDateISO: "2026-01-10", installmentIndex: 1 }))
      .toBe("2026-02-10");
    expect(installmentDueDate({ startDateISO: "2026-01-10", installmentIndex: 2 }))
      .toBe("2026-03-10");
  });

  it("aluna do dia 31: fevereiro NÃO é pulado — cai no último dia (28/29)", () => {
    const dates = contractDueDates({ startDateISO: "2026-01-31", installments: 4 });
    // 2026 não é bissexto
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("ano bissexto: 31/01/2028 → 29/02/2028", () => {
    expect(installmentDueDate({ startDateISO: "2028-01-31", installmentIndex: 1 }))
      .toBe("2028-02-29");
  });

  it("vira o ano corretamente (contrato de novembro)", () => {
    const dates = contractDueDates({ startDateISO: "2026-11-05", installments: 4 });
    expect(dates).toEqual(["2026-11-05", "2026-12-05", "2027-01-05", "2027-02-05"]);
  });

  it("payment_day do contrato tem precedência sobre o dia do início", () => {
    expect(
      installmentDueDate({ startDateISO: "2026-01-25", paymentDay: 28, installmentIndex: 0 }),
    ).toBe("2026-01-28");
  });

  it("1ª parcela nunca vence ANTES do contrato: dia 10 com início dia 25 → mês seguinte", () => {
    const dates = contractDueDates({
      startDateISO: "2026-01-25",
      paymentDay: 10,
      installments: 3,
    });
    expect(dates).toEqual(["2026-02-10", "2026-03-10", "2026-04-10"]);
  });

  it("payment_day inválido (0, 32, null) cai no dia do início", () => {
    expect(resolvePaymentDay("2026-01-25", null)).toBe(25);
    expect(resolvePaymentDay("2026-01-25", 0)).toBe(25);
    expect(resolvePaymentDay("2026-01-25", 32)).toBe(25);
  });

  it("NUNCA gera data civil inválida (o C4 do gerador de despesas)", () => {
    // 31 em todos os meses de um ano inteiro: sempre data válida
    const dates = contractDueDates({ startDateISO: "2026-01-31", installments: 24 });
    for (const d of dates) {
      const [y, m, day] = d.split("-").map(Number);
      expect(day).toBeLessThanOrEqual(lastDayOfMonth(y, m));
      expect(new Date(`${d}T00:00:00Z`).getUTCDate()).toBe(day);
    }
  });

  it("entradas inválidas lançam em vez de gerar lixo", () => {
    expect(() => contractDueDates({ startDateISO: "2026-01-10", installments: 0 })).toThrow();
    expect(() => installmentDueDate({ startDateISO: "lixo", installmentIndex: 0 })).toThrow();
    expect(() =>
      installmentDueDate({ startDateISO: "2026-01-10", installmentIndex: -1 }),
    ).toThrow();
  });
});
