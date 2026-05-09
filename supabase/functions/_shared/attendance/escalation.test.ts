import { describe, expect, it } from "vitest";
import {
  newAlertInitialState,
  shouldEscalate,
  type EscalationCandidate,
} from "./escalation";

function candidate(
  overrides: Partial<EscalationCandidate> = {},
): EscalationCandidate {
  return {
    id: "alert-1",
    status: "pending",
    acknowledged_at: null,
    escalated_at: null,
    notified_at: null,
    created_at: "2026-05-08T00:00:00Z",
    ...overrides,
  };
}

describe("newAlertInitialState", () => {
  it("cria alerta novo como pending, sem escalated_at", () => {
    expect(newAlertInitialState()).toEqual({
      status: "pending",
      escalated_at: null,
    });
  });
});

describe("shouldEscalate", () => {
  const opts = {
    now: new Date("2026-05-09T12:00:00Z"),
    escalationHours: 24,
  };

  it("nao escala status diferente de pending", () => {
    const r = shouldEscalate(
      candidate({
        status: "escalated",
        notified_at: "2026-05-07T00:00:00Z",
      }),
      opts,
    );
    expect(r).toEqual({ escalate: false, reason: "status_not_pending" });
  });

  it("nao escala alerta acknowledged", () => {
    const r = shouldEscalate(
      candidate({
        notified_at: "2026-05-07T00:00:00Z",
        acknowledged_at: "2026-05-08T10:00:00Z",
      }),
      opts,
    );
    expect(r).toEqual({ escalate: false, reason: "already_acknowledged" });
  });

  it("nao escala alerta com escalated_at preenchido", () => {
    const r = shouldEscalate(
      candidate({
        notified_at: "2026-05-07T00:00:00Z",
        escalated_at: "2026-05-08T10:00:00Z",
      }),
      opts,
    );
    expect(r).toEqual({ escalate: false, reason: "already_escalated" });
  });

  it("nao escala alerta recém-notificado antes de 24h", () => {
    const r = shouldEscalate(
      candidate({ notified_at: "2026-05-09T00:00:01Z" }),
      opts,
    );
    expect(r).toEqual({ escalate: false, reason: "too_recent" });
  });

  it("escala alerta com notified_at ha pelo menos 24h", () => {
    const r = shouldEscalate(
      candidate({ notified_at: "2026-05-08T12:00:00Z" }),
      opts,
    );
    expect(r).toEqual({ escalate: true, reason: "eligible_since_notified" });
  });

  it("usa created_at como fallback quando notified_at e null e ainda recente", () => {
    const r = shouldEscalate(
      candidate({
        notified_at: null,
        created_at: "2026-05-09T08:00:00Z",
      }),
      opts,
    );
    expect(r).toEqual({ escalate: false, reason: "too_recent" });
  });

  it("usa created_at como fallback e escala quando antigo", () => {
    const r = shouldEscalate(
      candidate({
        notified_at: null,
        created_at: "2026-05-08T11:00:00Z",
      }),
      opts,
    );
    expect(r).toEqual({ escalate: true, reason: "eligible_since_created" });
  });

  it("prefere notified_at sobre created_at quando ambos existem", () => {
    const r = shouldEscalate(
      candidate({
        created_at: "2026-05-01T00:00:00Z",
        notified_at: "2026-05-09T08:00:00Z",
      }),
      opts,
    );
    expect(r).toEqual({ escalate: false, reason: "too_recent" });
  });

  it("nao escala sem base temporal valida", () => {
    const r = shouldEscalate(
      candidate({ notified_at: "not-a-date", created_at: "" }),
      opts,
    );
    expect(r).toEqual({
      escalate: false,
      reason: "invalid_temporal_base",
    });
  });
});
