import { describe, expect, it } from "vitest";
import {
  evaluatePreLiveChecks,
  hoursSince,
  isE164,
  isValidSendWindow,
  type PreLiveInput,
} from "./prelive";

describe("isE164", () => {
  it("aceita E.164 válido", () => {
    expect(isE164("+5561999743974")).toBe(true);
    expect(isE164("+556199743974")).toBe(true); // legacy BR sem 9
    expect(isE164("+14155238886")).toBe(true);
  });

  it("rejeita formato inválido", () => {
    expect(isE164("5561999743974")).toBe(false); // sem +
    expect(isE164("+0561999743974")).toBe(false); // começa com 0
    expect(isE164("+55 61 99974-3974")).toBe(false); // espaços/traços
    expect(isE164("+551")).toBe(false); // curto demais
    expect(isE164("+1234567890123456")).toBe(false); // longo demais
    expect(isE164("")).toBe(false);
    expect(isE164(null)).toBe(false);
    expect(isE164(undefined)).toBe(false);
  });

  it("tolera whitespace nas pontas", () => {
    expect(isE164("  +5561999743974  ")).toBe(true);
  });
});

describe("isValidSendWindow", () => {
  it("aceita janela válida", () => {
    expect(
      isValidSendWindow({ start_hour: 9, end_hour: 19, days_of_week: [1, 2, 3, 4, 5] }),
    ).toBe(true);
  });

  it("rejeita start >= end", () => {
    expect(
      isValidSendWindow({ start_hour: 19, end_hour: 9, days_of_week: [1] }),
    ).toBe(false);
    expect(
      isValidSendWindow({ start_hour: 12, end_hour: 12, days_of_week: [1] }),
    ).toBe(false);
  });

  it("rejeita dias vazios", () => {
    expect(
      isValidSendWindow({ start_hour: 9, end_hour: 19, days_of_week: [] }),
    ).toBe(false);
  });

  it("rejeita dia fora de 0-6", () => {
    expect(
      isValidSendWindow({ start_hour: 9, end_hour: 19, days_of_week: [1, 7] }),
    ).toBe(false);
    expect(
      isValidSendWindow({ start_hour: 9, end_hour: 19, days_of_week: [-1] }),
    ).toBe(false);
  });

  it("rejeita horas fora do range", () => {
    expect(
      isValidSendWindow({ start_hour: -1, end_hour: 19, days_of_week: [1] }),
    ).toBe(false);
    expect(
      isValidSendWindow({ start_hour: 9, end_hour: 25, days_of_week: [1] }),
    ).toBe(false);
  });

  it("rejeita null/undefined", () => {
    expect(isValidSendWindow(null)).toBe(false);
    expect(isValidSendWindow(undefined)).toBe(false);
  });

  it("aceita end_hour=24 (meia-noite)", () => {
    expect(
      isValidSendWindow({ start_hour: 9, end_hour: 24, days_of_week: [1] }),
    ).toBe(true);
  });
});

describe("hoursSince", () => {
  const now = new Date("2026-05-14T12:00:00Z");

  it("calcula horas corretamente", () => {
    expect(hoursSince("2026-05-14T10:00:00Z", now)).toBeCloseTo(2);
    expect(hoursSince("2026-05-13T12:00:00Z", now)).toBeCloseTo(24);
  });

  it("retorna null pra input inválido", () => {
    expect(hoursSince(null, now)).toBeNull();
    expect(hoursSince("", now)).toBeNull();
    expect(hoursSince("not-a-date", now)).toBeNull();
  });
});

// Helper pra montar input válido (GO) e variar campos por teste.
function validInput(overrides: Partial<PreLiveInput> = {}): PreLiveInput {
  return {
    mode: "shadow",
    shadowPhone: "+556199743974",
    fallbackTrainerId: "tr-raquel",
    fallbackTrainer: {
      id: "tr-raquel",
      full_name: "Raquel",
      phone: "+5561988887777",
    },
    fallbackTrainerActive: true,
    cronSecretPresent: true,
    sendWindow: { start_hour: 9, end_hour: 19, days_of_week: [1, 2, 3, 4, 5] },
    healthcheckLastStatus: "ok",
    healthcheckLastOkAt: "2026-05-14T10:00:00Z",
    healthcheckConsecutiveFailures: 0,
    activeTrainers: [
      { id: "tr-jp", full_name: "JP", phone: "+5561988880001" },
      { id: "tr-raquel", full_name: "Raquel", phone: "+5561988887777" },
    ],
    expectedCrons: [
      "attendance-detect-22h",
      "attendance-evo-sync-21h40",
      "attendance-channel-healthcheck-7h-sp",
    ],
    presentCrons: [
      "attendance-detect-22h",
      "attendance-evo-sync-21h40",
      "attendance-channel-healthcheck-7h-sp",
    ],
    now: new Date("2026-05-14T12:00:00Z"),
    ...overrides,
  };
}

describe("evaluatePreLiveChecks — cenário GO", () => {
  it("estado totalmente saudável → GO, zero blockers", () => {
    const r = evaluatePreLiveChecks(validInput());
    expect(r.decision).toBe("GO");
    expect(r.blockers).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
    expect(r.checks.every((c) => c.status === "pass")).toBe(true);
  });

  it("warning não bloqueia GO", () => {
    // shadow_phone vazio é warning, não blocker
    const r = evaluatePreLiveChecks(validInput({ shadowPhone: null }));
    expect(r.decision).toBe("GO");
    expect(r.blockers).toHaveLength(0);
    expect(r.warnings.map((w) => w.id)).toContain("shadow_phone_present");
  });

  it("healthcheck stale (>48h) é warning, não blocker", () => {
    const r = evaluatePreLiveChecks(
      validInput({ healthcheckLastOkAt: "2026-05-10T10:00:00Z" }),
    );
    expect(r.decision).toBe("GO");
    expect(r.warnings.map((w) => w.id)).toContain("healthcheck_recent");
  });
});

describe("evaluatePreLiveChecks — blockers individuais", () => {
  it("fallback_trainer_id vazio → NO-GO", () => {
    const r = evaluatePreLiveChecks(validInput({ fallbackTrainerId: null }));
    expect(r.decision).toBe("NO-GO");
    expect(r.blockers.map((b) => b.id)).toContain("fallback_trainer_set");
  });

  it("fallback trainer inativo → NO-GO", () => {
    const r = evaluatePreLiveChecks(
      validInput({ fallbackTrainerActive: false }),
    );
    expect(r.decision).toBe("NO-GO");
    expect(r.blockers.map((b) => b.id)).toContain("fallback_trainer_active");
  });

  it("fallback trainer não encontrado → NO-GO", () => {
    const r = evaluatePreLiveChecks(
      validInput({ fallbackTrainer: null, fallbackTrainerActive: null }),
    );
    expect(r.decision).toBe("NO-GO");
    expect(r.blockers.map((b) => b.id)).toContain("fallback_trainer_active");
  });

  it("fallback trainer sem phone E.164 → NO-GO", () => {
    const r = evaluatePreLiveChecks(
      validInput({
        fallbackTrainer: {
          id: "tr-raquel",
          full_name: "Raquel",
          phone: "61988887777",
        },
      }),
    );
    expect(r.decision).toBe("NO-GO");
    expect(r.blockers.map((b) => b.id)).toContain("fallback_trainer_phone");
  });

  it("cron_secret ausente → NO-GO", () => {
    const r = evaluatePreLiveChecks(validInput({ cronSecretPresent: false }));
    expect(r.decision).toBe("NO-GO");
    expect(r.blockers.map((b) => b.id)).toContain("cron_secret_present");
  });

  it("send_window inválido → NO-GO", () => {
    const r = evaluatePreLiveChecks(
      validInput({
        sendWindow: { start_hour: 19, end_hour: 9, days_of_week: [1] },
      }),
    );
    expect(r.decision).toBe("NO-GO");
    expect(r.blockers.map((b) => b.id)).toContain("send_window_valid");
  });

  it("healthcheck failed → NO-GO", () => {
    const r = evaluatePreLiveChecks(
      validInput({ healthcheckLastStatus: "failed" }),
    );
    expect(r.decision).toBe("NO-GO");
    expect(r.blockers.map((b) => b.id)).toContain("healthcheck_not_failed");
  });

  it("healthcheck com falhas consecutivas → NO-GO", () => {
    const r = evaluatePreLiveChecks(
      validInput({ healthcheckConsecutiveFailures: 2 }),
    );
    expect(r.decision).toBe("NO-GO");
    expect(r.blockers.map((b) => b.id)).toContain(
      "healthcheck_no_consecutive_failures",
    );
  });

  it("trainer ativo sem phone → NO-GO", () => {
    const r = evaluatePreLiveChecks(
      validInput({
        activeTrainers: [
          { id: "tr-jp", full_name: "JP", phone: null },
          { id: "tr-raquel", full_name: "Raquel", phone: "+5561988887777" },
        ],
      }),
    );
    expect(r.decision).toBe("NO-GO");
    const block = r.blockers.find(
      (b) => b.id === "active_trainers_have_phone",
    );
    expect(block).toBeDefined();
    expect(block!.detail).toContain("JP");
  });

  it("cron faltando → NO-GO", () => {
    const r = evaluatePreLiveChecks(
      validInput({
        presentCrons: ["attendance-detect-22h", "attendance-evo-sync-21h40"],
      }),
    );
    expect(r.decision).toBe("NO-GO");
    const block = r.blockers.find((b) => b.id === "crons_present");
    expect(block).toBeDefined();
    expect(block!.detail).toContain("attendance-channel-healthcheck-7h-sp");
  });
});

describe("evaluatePreLiveChecks — múltiplos blockers", () => {
  it("acumula todos os blockers, não para no primeiro", () => {
    const r = evaluatePreLiveChecks(
      validInput({
        fallbackTrainerId: null,
        cronSecretPresent: false,
        healthcheckLastStatus: "failed",
      }),
    );
    expect(r.decision).toBe("NO-GO");
    expect(r.blockers.length).toBeGreaterThanOrEqual(3);
    const ids = r.blockers.map((b) => b.id);
    expect(ids).toContain("fallback_trainer_set");
    expect(ids).toContain("cron_secret_present");
    expect(ids).toContain("healthcheck_not_failed");
  });

  it("checks sempre tem 11 entradas (cobertura total)", () => {
    const r = evaluatePreLiveChecks(validInput());
    expect(r.checks).toHaveLength(11);
  });
});
