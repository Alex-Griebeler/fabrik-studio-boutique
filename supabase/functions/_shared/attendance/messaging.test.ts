import { describe, it, expect } from "vitest";
import { buildTrainerAlertMessage, buildEscalationMessage } from "./messaging";

describe("buildTrainerAlertMessage", () => {
  it("monta alerta de grupo (2 faltas)", () => {
    const msg = buildTrainerAlertMessage({
      studentName: "João Silva",
      planLabel: "Grupo 3x/semana",
      lastAttendedAt: "2026-05-01",
      missedDates: ["2026-05-03", "2026-05-05"],
      ackUrl: "https://x.example/ack?t=abc",
      alertType: "group_2_misses",
    });
    expect(msg).toContain("João Silva");
    expect(msg).toContain("Grupo 3x/semana");
    expect(msg).toContain("Última presença: 01/05");
    expect(msg).toContain("03/05 e 05/05");
    expect(msg).toContain("https://x.example/ack?t=abc");
    expect(msg).toContain("2ª falta seguida");
  });

  it("monta alerta PT (1 falta)", () => {
    const msg = buildTrainerAlertMessage({
      studentName: "Maria Santos",
      planLabel: "Personal Training",
      lastAttendedAt: "2026-04-30",
      missedDates: ["2026-05-06"],
      ackUrl: "https://x.example/ack?t=def",
      alertType: "pt_1_miss",
    });
    expect(msg).toContain("Aluno PT faltou");
    expect(msg).toContain("Maria Santos");
    expect(msg).toContain("06/05");
  });

  it("lida com lastAttendedAt null", () => {
    const msg = buildTrainerAlertMessage({
      studentName: "Aluno X",
      planLabel: "Grupo",
      lastAttendedAt: null,
      missedDates: ["2026-05-03", "2026-05-05"],
      ackUrl: "https://x.example/ack",
      alertType: "group_2_misses",
    });
    expect(msg).toContain("Sem presença recente registrada");
  });

  it("formata 3+ datas com vírgula e 'e'", () => {
    const msg = buildTrainerAlertMessage({
      studentName: "Y",
      planLabel: "Grupo",
      lastAttendedAt: "2026-04-01",
      missedDates: ["2026-05-01", "2026-05-03", "2026-05-05"],
      ackUrl: "https://x.example/a",
      alertType: "group_2_misses",
    });
    expect(msg).toContain("01/05, 03/05 e 05/05");
  });
});

describe("buildEscalationMessage", () => {
  it("monta mensagem de escalação", () => {
    const msg = buildEscalationMessage({
      studentName: "Pedro",
      planLabel: "Grupo 2x/semana",
      lastAttendedAt: "2026-05-01",
      missedDates: ["2026-05-03", "2026-05-05"],
      ackUrl: "https://x.example/ack?t=esc",
      alertType: "group_2_misses",
      trainerName: "JP",
      hoursOpen: 24,
    });
    expect(msg).toContain("Escalação");
    expect(msg).toContain("Pedro");
    expect(msg).toContain("JP");
    expect(msg).toContain("24h");
    expect(msg).toContain("https://x.example/ack?t=esc");
  });
});
