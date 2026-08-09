import { describe, expect, it } from "vitest";
import { sessionPaymentSnapshot } from "./sessionPayment";

describe("sessionPaymentSnapshot — base hourly", () => {
  it("60 minutos a R$100/h = R$100,00", () => {
    expect(sessionPaymentSnapshot(60, { rate_cents: 10000, rate_basis: "hourly" })).toEqual({
      trainer_hourly_rate_cents: 10000,
      payment_hours: 1,
      payment_amount_cents: 10000,
      payment_rate_basis: "hourly",
    });
  });

  it("90 minutos a R$100/h = 1,5h = R$150,00", () => {
    const s = sessionPaymentSnapshot(90, { rate_cents: 10000, rate_basis: "hourly" });
    expect(s.payment_hours).toBe(1.5);
    expect(s.payment_amount_cents).toBe(15000);
  });

  it("arredonda centavos (75min × R$99,99/h)", () => {
    const s = sessionPaymentSnapshot(75, { rate_cents: 9999, rate_basis: "hourly" });
    expect(s.payment_amount_cents).toBe(12499);
  });
});

describe("sessionPaymentSnapshot — base per_session", () => {
  it("valor CRAVADO independe da duração (fisio 30min = fisio 60min)", () => {
    const s30 = sessionPaymentSnapshot(30, { rate_cents: 10800, rate_basis: "per_session" });
    const s60 = sessionPaymentSnapshot(60, { rate_cents: 10800, rate_basis: "per_session" });
    expect(s30.payment_amount_cents).toBe(10800);
    expect(s60.payment_amount_cents).toBe(10800);
    expect(s30.payment_rate_basis).toBe("per_session");
    // horas continuam informativas (relatório), sem afetar o valor:
    expect(s30.payment_hours).toBe(0.5);
    expect(s60.payment_hours).toBe(1);
  });
});

describe("sessionPaymentSnapshot — sem tarifa", () => {
  it("null → snapshot zerado com base null (nunca valor inventado)", () => {
    expect(sessionPaymentSnapshot(60, null)).toEqual({
      trainer_hourly_rate_cents: 0,
      payment_hours: 1,
      payment_amount_cents: 0,
      payment_rate_basis: null,
    });
  });

  it("tarifa zero/negativa/NaN → zerado com base null", () => {
    expect(sessionPaymentSnapshot(60, { rate_cents: 0, rate_basis: "hourly" }).payment_rate_basis).toBeNull();
    expect(sessionPaymentSnapshot(60, { rate_cents: -5, rate_basis: "per_session" }).payment_amount_cents).toBe(0);
    expect(sessionPaymentSnapshot(60, { rate_cents: NaN, rate_basis: "hourly" }).payment_amount_cents).toBe(0);
  });

  it("duração inválida zera horas sem quebrar", () => {
    const s = sessionPaymentSnapshot(NaN, { rate_cents: 10000, rate_basis: "hourly" });
    expect(s.payment_hours).toBe(0);
    expect(s.payment_amount_cents).toBe(0);
  });

  it("per_session com duração inválida ainda paga a sessão (valor cravado)", () => {
    const s = sessionPaymentSnapshot(NaN, { rate_cents: 10800, rate_basis: "per_session" });
    expect(s.payment_amount_cents).toBe(10800);
  });
});
