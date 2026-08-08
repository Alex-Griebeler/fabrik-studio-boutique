import { describe, expect, it } from "vitest";
import { sessionPaymentSnapshot } from "./sessionPayment";

describe("sessionPaymentSnapshot", () => {
  it("60 minutos a R$100/h = R$100,00", () => {
    expect(sessionPaymentSnapshot(60, 10000)).toEqual({
      trainer_hourly_rate_cents: 10000,
      payment_hours: 1,
      payment_amount_cents: 10000,
    });
  });

  it("90 minutos a R$100/h = 1,5h = R$150,00", () => {
    const s = sessionPaymentSnapshot(90, 10000);
    expect(s.payment_hours).toBe(1.5);
    expect(s.payment_amount_cents).toBe(15000);
  });

  it("arredonda centavos (75min × R$99,99/h)", () => {
    // 1.25h × 9999 = 12498.75 → 12499
    expect(sessionPaymentSnapshot(75, 9999).payment_amount_cents).toBe(12499);
  });

  it("tarifa nula/indefinida/zero vira snapshot zerado, sem lançar", () => {
    for (const rate of [null, undefined, 0, -50, NaN]) {
      const s = sessionPaymentSnapshot(60, rate as number | null | undefined);
      expect(s.trainer_hourly_rate_cents).toBe(0);
      expect(s.payment_amount_cents).toBe(0);
      expect(s.payment_hours).toBe(1);
    }
  });

  it("duração inválida vira zero horas, sem lançar", () => {
    for (const dur of [0, -30, NaN]) {
      const s = sessionPaymentSnapshot(dur, 10000);
      expect(s.payment_hours).toBe(0);
      expect(s.payment_amount_cents).toBe(0);
    }
  });
});
