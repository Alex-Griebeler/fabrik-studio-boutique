import { describe, it, expect } from "vitest";
import {
  newAlertInitialState,
  shouldEscalate,
  type EscalationCandidate,
} from "./escalation.ts";

const baseAlert = (
  overrides: Partial<EscalationCandidate> = {},
): EscalationCandidate => ({
  id: "alert-1",
  status: "pending",
  acknowledged_at: null,
  escalated_at: null,
  notified_at: null,
  created_at: "2026-05-08T00:00:00Z",
  ...overrides,
});

describe("newAlertInitialState", () => {
  it("alerta novo nasce sempre pending sem escalated_at", () => {
    expect(newAlertInitialState()).toEqual({
      status: "pending",
      escalated_at: null,
    });
  });
});

describe("shouldEscalate", () => {
  const now = new Date("2026-05-09T12:00:00Z");
  const opts = { now, escalationHours: 24 };

  it("nao escala quando status ja escalated", () => {
    const r = shouldEscalate(
      baseAlert({ status: "escalated", notified_at: "2026-05-07T00:00:00Z" }),
      opts,
    );
    expect(r.escalate).toBe(false);
    expect(r.reason).toBe("status_escalated");
  });

  it("nao escala quando ja acknowledged", () => {
    const r = shouldEscalate(
      baseAlert({
        notified_at: "2026-05-07T00:00:00Z",
        acknowledged_at: "2026-05-08T10:00:00Z",
      }),
      opts,
    );
    expect(r.escalate).toBe(false);
    expect(r.reason).toBe("already_acknowledged");
  });

  it("nao escala quando ja tem escalated_at preenchido", () => {
    const r = shouldEscalate(
      baseAlert({
        notified_at: "2026-05-07T00:00:00Z",
        escalated_at: "2026-05-08T10:00:00Z",
      }),
      opts,
    );
    expect(r.escalate).toBe(false);
    expect(r.reason).toBe("already_escalated");
  });

  it("nao escala alerta recem-notificado (< 24h)", () => {
    const r = shouldEscalate(
      baseAlert({ notified_at: "2026-05-09T00:00:01Z" }),
      opts,
    );
    expect(r.escalate).toBe(false);
    expect(r.reason).toBe("too_recent");
  });

  it("escala alerta com notified_at > 24h atras", () => {
    const r = shouldEscalate(
      baseAlert({ notified_at: "2026-05-08T11:59:59Z" }),
      opts,
    );
    expect(r.escalate).toBe(true);
    expect(r.reason).toBe("aged_since_notified");
  });

  it("nao escala quando notified_at e null mesmo com created_at antigo", () => {
    const r = shouldEscalate(
      baseAlert({ notified_at: null, created_at: "2026-05-01T00:00:00Z" }),
      opts,
    );
    expect(r.escalate).toBe(false);
    expect(r.reason).toBe("not_notified_yet");
  });

  it("nao escala quando notified_at e null e created_at recente", () => {
    const r = shouldEscalate(
      baseAlert({ notified_at: null, created_at: "2026-05-09T08:00:00Z" }),
      opts,
    );
    expect(r.escalate).toBe(false);
    expect(r.reason).toBe("not_notified_yet");
  });

  it("ignora created_at antigo quando notified_at e recente", () => {
    const r = shouldEscalate(
      baseAlert({
        created_at: "2026-05-01T00:00:00Z",
        notified_at: "2026-05-09T08:00:00Z",
      }),
      opts,
    );
    expect(r.escalate).toBe(false);
    expect(r.reason).toBe("too_recent");
  });

  it("nao escala quando notified_at em formato invalido", () => {
    const r = shouldEscalate(
      baseAlert({ notified_at: "not-a-date" }),
      opts,
    );
    expect(r.escalate).toBe(false);
    expect(r.reason).toBe("invalid_notified_at");
  });

  it("escala exatamente no limite (idade == escalationHours)", () => {
    const r = shouldEscalate(
      baseAlert({ notified_at: "2026-05-08T12:00:00Z" }),
      opts,
    );
    expect(r.escalate).toBe(true);
    expect(r.reason).toBe("aged_since_notified");
  });
});
