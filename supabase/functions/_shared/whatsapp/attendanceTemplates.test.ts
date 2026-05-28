import { describe, expect, it } from "vitest";
import {
  buildEscalationBody,
  buildTrainerAlertBody,
  currentWhatsappProvider,
  type EscalationData,
  type TrainerAlertData,
  type WhatsappTemplateBody,
} from "./attendanceTemplates";

const baseTrainer: TrainerAlertData = {
  to: "+5561999999999",
  ackToken: "abc123",
  ackUrl: "https://example.test/ack?token=abc123",
  studentName: "Maria Silva",
  planLabel: "Grupo 3x/semana",
  lastAttendedAt: "2026-05-12",
  missedDates: ["2026-05-15", "2026-05-17"],
  alertType: "group_2_misses",
};

const baseEscalation: EscalationData = {
  ...baseTrainer,
  trainerName: "Carlos",
  hoursOpen: 24,
};

function asTemplate(body: unknown): WhatsappTemplateBody {
  if (!body || typeof body !== "object" || !("template" in body)) {
    throw new Error("body não é template");
  }
  return body as WhatsappTemplateBody;
}

describe("currentWhatsappProvider", () => {
  it("default twilio quando undefined", () => {
    expect(currentWhatsappProvider(undefined)).toBe("twilio");
  });
  it("retorna meta quando explícito", () => {
    expect(currentWhatsappProvider("meta")).toBe("meta");
  });
  it("propaga erro de provider desconhecido", () => {
    expect(() => currentWhatsappProvider("infobip")).toThrow(/Unknown/);
  });
});

describe("buildTrainerAlertBody — twilio (default)", () => {
  it("devolve {to,message} idêntico ao que buildTrainerAlertMessage produzia", () => {
    const body = buildTrainerAlertBody(baseTrainer, "twilio");
    expect("template" in body).toBe(false);
    if ("message" in body) {
      // Smoke: contém nome, plano, datas, ack URL — sem mudança visual
      expect(body.to).toBe("+5561999999999");
      expect(body.message).toContain("Maria Silva");
      expect(body.message).toContain("Grupo 3x/semana");
      expect(body.message).toContain("15/05");
      expect(body.message).toContain("17/05");
      expect(body.message).toContain("https://example.test/ack?token=abc123");
    } else {
      throw new Error("body twilio sem campo 'message'");
    }
  });
});

describe("buildTrainerAlertBody — meta", () => {
  it("group_2_misses gera template fabrik_alerta_falta_grupo", () => {
    const body = asTemplate(buildTrainerAlertBody(baseTrainer, "meta"));
    expect(body.to).toBe("+5561999999999");
    expect(body.template.name).toBe("fabrik_alerta_falta_grupo");
    expect(body.template.language).toBe("pt_BR");

    // Header tem qty
    const header = (body.template.components as Array<{ type: string; parameters?: unknown[] }>)
      .find((c) => c.type === "header");
    expect(header?.parameters).toEqual([{ type: "text", text: "2" }]);

    // Body tem 5 vars na ordem (qty, aluno, plano, última, faltas)
    const bodyComp = (body.template.components as Array<{ type: string; parameters?: unknown[] }>)
      .find((c) => c.type === "body");
    expect(bodyComp?.parameters).toEqual([
      { type: "text", text: "2" },
      { type: "text", text: "Maria Silva" },
      { type: "text", text: "Grupo 3x/semana" },
      { type: "text", text: "12/05" },
      { type: "text", text: "15/05 e 17/05" },
    ]);
  });

  it("group_2_misses tem button URL com ack_token como parameter", () => {
    const body = asTemplate(buildTrainerAlertBody(baseTrainer, "meta"));
    const btn = (body.template.components as Array<Record<string, unknown>>)
      .find((c) => c.type === "button") as
      | { type: string; sub_type?: string; index?: string; parameters?: unknown[] }
      | undefined;
    expect(btn?.sub_type).toBe("url");
    expect(btn?.index).toBe("0");
    expect(btn?.parameters).toEqual([{ type: "text", text: "abc123" }]);
  });

  it("pt_1_miss gera template fabrik_alerta_falta_pt com 4 vars body", () => {
    const pt: TrainerAlertData = {
      ...baseTrainer,
      alertType: "pt_1_miss",
      planLabel: "Personal Training 2x/semana",
      lastAttendedAt: "2026-05-16",
      missedDates: ["2026-05-18"],
      studentName: "João Lima",
    };
    const body = asTemplate(buildTrainerAlertBody(pt, "meta"));
    expect(body.template.name).toBe("fabrik_alerta_falta_pt");

    // PT não tem header
    const header = (body.template.components as Array<{ type: string }>)
      .find((c) => c.type === "header");
    expect(header).toBeUndefined();

    const bodyComp = (body.template.components as Array<{ type: string; parameters?: unknown[] }>)
      .find((c) => c.type === "body");
    expect(bodyComp?.parameters).toEqual([
      { type: "text", text: "João Lima" },
      { type: "text", text: "Personal Training 2x/semana" },
      { type: "text", text: "16/05" },
      { type: "text", text: "18/05" },
    ]);
  });

  it("lastAttendedAt null vira 'Sem presença recente registrada'", () => {
    const body = asTemplate(
      buildTrainerAlertBody({ ...baseTrainer, lastAttendedAt: null }, "meta"),
    );
    const bodyComp = (body.template.components as Array<{ type: string; parameters?: Array<{ text: string }> }>)
      .find((c) => c.type === "body");
    const last = bodyComp?.parameters?.[3];
    expect(last?.text).toBe("Sem presença recente registrada");
  });

  it("nenhum parameter contém markdown ou URL inline (vai no botão, não no body)", () => {
    const body = asTemplate(buildTrainerAlertBody(baseTrainer, "meta"));
    // Extrai SÓ os values `.text` dos params (ignora keys do JSON
    // como `sub_type`/`header_text`, que contêm `_` legítimo).
    const paramTexts = (body.template.components as Array<{ parameters?: Array<{ text?: string }> }>)
      .flatMap((c) => (c.parameters ?? []).map((p) => p.text ?? ""))
      .join("|");
    // markdown comum
    expect(paramTexts).not.toMatch(/\*[A-Za-z]/);
    expect(paramTexts).not.toMatch(/_[A-Za-z]/);
    // ack URL não pode vazar no body (só vai no botão como token)
    expect(paramTexts).not.toContain("functions.supabase.co");
    expect(paramTexts).not.toContain("https://");
  });
});

describe("buildEscalationBody — twilio (default)", () => {
  it("devolve {to,message} com nome do treinador titular e horas", () => {
    const body = buildEscalationBody(baseEscalation, "twilio");
    expect("template" in body).toBe(false);
    if ("message" in body) {
      expect(body.message).toContain("Carlos");
      expect(body.message).toContain("24");
      expect(body.message).toContain("Maria Silva");
      expect(body.message).toContain("https://example.test/ack?token=abc123");
    } else {
      throw new Error("body twilio sem 'message'");
    }
  });
});

describe("buildEscalationBody — meta", () => {
  it("gera template fabrik_escalacao_falta com 6 vars na ordem certa", () => {
    const body = asTemplate(buildEscalationBody(baseEscalation, "meta"));
    expect(body.template.name).toBe("fabrik_escalacao_falta");
    expect(body.template.language).toBe("pt_BR");

    const bodyComp = (body.template.components as Array<{ type: string; parameters?: unknown[] }>)
      .find((c) => c.type === "body");
    expect(bodyComp?.parameters).toEqual([
      { type: "text", text: "24" },
      { type: "text", text: "Carlos" },
      { type: "text", text: "Maria Silva" },
      { type: "text", text: "Grupo 3x/semana" },
      { type: "text", text: "12/05" },
      { type: "text", text: "15/05 e 17/05" },
    ]);
  });

  it("button URL traz o ack_token como text param", () => {
    const body = asTemplate(buildEscalationBody(baseEscalation, "meta"));
    const btn = (body.template.components as Array<Record<string, unknown>>)
      .find((c) => c.type === "button") as
      | { type: string; sub_type?: string; index?: string; parameters?: Array<{ text: string }> }
      | undefined;
    expect(btn?.sub_type).toBe("url");
    expect(btn?.parameters?.[0]?.text).toBe("abc123");
  });
});

describe("formatação", () => {
  it("joinDates: 1, 2 e 3+ entradas", () => {
    const make = (missed: string[]) =>
      asTemplate(buildTrainerAlertBody({ ...baseTrainer, missedDates: missed }, "meta"))
        .template.components as Array<{ type: string; parameters?: Array<{ text: string }> }>;

    const one = make(["2026-05-15"]).find((c) => c.type === "body")?.parameters?.[4]?.text;
    const two = make(["2026-05-15", "2026-05-17"]).find((c) => c.type === "body")
      ?.parameters?.[4]?.text;
    const three = make(["2026-05-15", "2026-05-16", "2026-05-17"]).find((c) => c.type === "body")
      ?.parameters?.[4]?.text;

    expect(one).toBe("15/05");
    expect(two).toBe("15/05 e 17/05");
    expect(three).toBe("15/05, 16/05 e 17/05");
  });
});
