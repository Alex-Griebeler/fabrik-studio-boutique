// Snapshot de pagamento de uma sessão (Onda 2d; PR-C: base por serviço).
//
// FONTE ÚNICA da matemática tarifa × sessão. A tarifa agora vem de
// trainer_service_rates (treinador × serviço) e tem BASE:
//  - hourly: valor = duração/60 × tarifa
//  - per_session: valor = tarifa, cravado, independe da duração
//
// `trainer_hourly_rate_cents` é o nome LEGADO da coluna de snapshot da
// tarifa — ela guarda a tarifa em centavos NAS DUAS bases; quem diz como
// interpretá-la é `payment_rate_basis` (a folha exibe na PR-D).

export type PaymentRateBasis = "hourly" | "per_session";

export interface ServiceRateForPayment {
  rate_cents: number;
  rate_basis: PaymentRateBasis;
}

export interface SessionPaymentSnapshot {
  trainer_hourly_rate_cents: number;
  payment_hours: number;
  payment_amount_cents: number;
  payment_rate_basis: PaymentRateBasis | null;
}

export function sessionPaymentSnapshot(
  durationMinutes: number,
  rate: ServiceRateForPayment | null | undefined,
): SessionPaymentSnapshot {
  const minutes =
    Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 0;
  const hours = minutes / 60;

  const cents =
    rate && Number.isFinite(rate.rate_cents) && rate.rate_cents > 0
      ? rate.rate_cents
      : 0;
  if (cents === 0) {
    // Sem tarifa válida = snapshot zerado e SEM base — nunca um valor
    // inventado. Quem chama decide se isso é permitido (sessão sem
    // treinador) ou bloqueio visível (treinador sem tarifa no serviço).
    return {
      trainer_hourly_rate_cents: 0,
      payment_hours: hours,
      payment_amount_cents: 0,
      payment_rate_basis: null,
    };
  }

  return {
    trainer_hourly_rate_cents: cents,
    payment_hours: hours,
    payment_amount_cents:
      rate!.rate_basis === "per_session" ? cents : Math.round(hours * cents),
    payment_rate_basis: rate!.rate_basis,
  };
}
