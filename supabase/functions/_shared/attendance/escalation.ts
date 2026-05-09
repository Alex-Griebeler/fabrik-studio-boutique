export interface EscalationCandidate {
  id: string;
  status: string;
  acknowledged_at: string | null;
  escalated_at: string | null;
  notified_at: string | null;
  created_at: string | null;
}

export interface EscalationOptions {
  now: Date;
  escalationHours: number;
}

export interface EscalationDecision {
  escalate: boolean;
  reason:
    | "eligible_since_notified"
    | "eligible_since_created"
    | "status_not_pending"
    | "already_acknowledged"
    | "already_escalated"
    | "too_recent"
    | "invalid_temporal_base";
}

export function newAlertInitialState(): {
  status: "pending";
  escalated_at: null;
} {
  return {
    status: "pending",
    escalated_at: null,
  };
}

export function shouldEscalate(
  alert: EscalationCandidate,
  opts: EscalationOptions,
): EscalationDecision {
  if (alert.status !== "pending") {
    return { escalate: false, reason: "status_not_pending" };
  }
  if (alert.acknowledged_at) {
    return { escalate: false, reason: "already_acknowledged" };
  }
  if (alert.escalated_at) {
    return { escalate: false, reason: "already_escalated" };
  }

  const basis = alert.notified_at ?? alert.created_at;
  const basisKind = alert.notified_at ? "notified" : "created";
  if (!basis) {
    return { escalate: false, reason: "invalid_temporal_base" };
  }

  const basisDate = new Date(basis);
  if (Number.isNaN(basisDate.getTime())) {
    return { escalate: false, reason: "invalid_temporal_base" };
  }

  const ageMs = opts.now.getTime() - basisDate.getTime();
  const thresholdMs = opts.escalationHours * 60 * 60 * 1000;
  if (ageMs < thresholdMs) {
    return { escalate: false, reason: "too_recent" };
  }

  return {
    escalate: true,
    reason:
      basisKind === "notified"
        ? "eligible_since_notified"
        : "eligible_since_created",
  };
}
