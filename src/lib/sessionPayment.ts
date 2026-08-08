// Snapshot de pagamento de uma sessão (Onda 2d).
//
// FONTE ÚNICA da matemática duração × tarifa. Antes ela vivia só no
// SessionFormDialog — o gerador automático de sessões (agenda a partir
// dos templates) criava tudo SEM treinador e SEM valor, e a folha
// inteira somava R$ 0,00 (as 18 sessões de produção estavam 18/18 sem
// trainer_id e sem payment_amount_cents).

export interface SessionPaymentSnapshot {
  trainer_hourly_rate_cents: number;
  payment_hours: number;
  payment_amount_cents: number;
}

export function sessionPaymentSnapshot(
  durationMinutes: number,
  hourlyRateCents: number | null | undefined,
): SessionPaymentSnapshot {
  const rate =
    Number.isFinite(hourlyRateCents ?? NaN) && (hourlyRateCents as number) > 0
      ? (hourlyRateCents as number)
      : 0;
  const minutes =
    Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 0;
  const hours = minutes / 60;
  return {
    trainer_hourly_rate_cents: rate,
    payment_hours: hours,
    payment_amount_cents: Math.round(hours * rate),
  };
}
