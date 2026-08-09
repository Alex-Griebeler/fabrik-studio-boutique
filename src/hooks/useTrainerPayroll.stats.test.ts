// KPI "Taxa Média/Hora" (PR-D): média SÓ das sessões pagas por hora —
// valor cravado (per_session) dividido por horas inventaria uma taxa.
import { describe, expect, it } from "vitest";
import { useTrainerPayrollStats, type TrainerPayrollSession } from "./useTrainerPayroll";

const base = {
  session_date: "2026-08-05",
  start_time: "06:00",
  end_time: "07:00",
  session_type: "group" as const,
  modality: "flow",
  status: "completed",
  is_paid: false,
  paid_at: null,
  student_name: null,
  service_type_id: null,
  service_name: null,
};

const mk = (over: Partial<TrainerPayrollSession>): TrainerPayrollSession =>
  ({ ...base, id: Math.random().toString(), duration_minutes: 60, payment_hours: 1, payment_amount_cents: 10000, payment_rate_basis: "hourly", ...over }) as TrainerPayrollSession;

describe("useTrainerPayrollStats — taxa média honesta", () => {
  it("folha híbrida: média ignora per_session (fisio 30min/R$108 NÃO vira R$216/h)", () => {
    const stats = useTrainerPayrollStats([
      mk({ payment_hours: 1, payment_amount_cents: 10000, payment_rate_basis: "hourly" }),
      mk({ payment_hours: 0.5, payment_amount_cents: 10800, payment_rate_basis: "per_session" }),
    ]);
    expect(stats.avgRateCents).toBe(10000); // só a hourly conta
    expect(stats.hasHourly).toBe(true);
    // totais continuam somando TUDO (o dinheiro é real):
    expect(stats.totalAmountCents).toBe(20800);
  });

  it("base legada (null) é hourly implícito e entra na média", () => {
    const stats = useTrainerPayrollStats([
      mk({ payment_hours: 2, payment_amount_cents: 24000, payment_rate_basis: null }),
    ]);
    expect(stats.avgRateCents).toBe(12000);
  });

  it("só per_session: sem taxa média inventada (hasHourly=false)", () => {
    const stats = useTrainerPayrollStats([
      mk({ payment_hours: 0.5, payment_amount_cents: 10800, payment_rate_basis: "per_session" }),
    ]);
    expect(stats.avgRateCents).toBe(0);
    expect(stats.hasHourly).toBe(false);
  });
});
