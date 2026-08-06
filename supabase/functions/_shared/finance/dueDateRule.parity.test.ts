import { describe, expect, it } from "vitest";
import * as canonical from "./dueDateRule";
import * as mirror from "../../../../src/lib/dueDateRule";

/**
 * PARIDADE canônico (edge) × espelho (frontend): o Vite não aceita
 * import com extensão .ts que o Deno exige, então a regra existe em dois
 * arquivos. Este teste é o cadeado — se alguém alterar um sem o outro,
 * o CI quebra aqui.
 */
describe("dueDateRule: canônico (edge) ≡ espelho (src)", () => {
  const starts = [
    "2026-01-10", "2026-01-25", "2026-01-31", "2026-02-01",
    "2026-02-28", "2026-08-25", "2026-11-05", "2027-12-31",
    "2028-01-31", // ano bissexto à frente
  ];
  const paymentDays = [null, 1, 5, 10, 25, 28, 31, 0, 32];
  const installmentCounts = [1, 3, 12, 24];

  it("mesmo resultado em toda a matriz de casos", () => {
    for (const startDateISO of starts) {
      for (const paymentDay of paymentDays) {
        for (const installments of installmentCounts) {
          const a = canonical.contractDueDates({ startDateISO, paymentDay, installments });
          const b = mirror.contractDueDates({ startDateISO, paymentDay, installments });
          expect(b, `start=${startDateISO} day=${paymentDay} n=${installments}`).toEqual(a);
        }
      }
    }
  });

  it("mesmos erros nas mesmas entradas inválidas", () => {
    expect(() => canonical.contractDueDates({ startDateISO: "lixo", installments: 3 })).toThrow();
    expect(() => mirror.contractDueDates({ startDateISO: "lixo", installments: 3 })).toThrow();
    expect(() => canonical.contractDueDates({ startDateISO: "2026-01-10", installments: 0 })).toThrow();
    expect(() => mirror.contractDueDates({ startDateISO: "2026-01-10", installments: 0 })).toThrow();
  });
});
