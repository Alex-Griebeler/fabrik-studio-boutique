import { describe, expect, it } from "vitest";
import {
  buildAdapter,
  parseOutgoing,
  resolveProvider,
  WhatsappBodyError,
  type FactoryEnv,
} from "./factory";
import { TwilioAdapter } from "./twilio";
import { MetaAdapter } from "./meta";

const twilioEnv: FactoryEnv = {
  TWILIO_ACCOUNT_SID: "AC123",
  TWILIO_AUTH_TOKEN: "secret",
  TWILIO_WHATSAPP_SANDBOX_NUMBER: "+14155238886",
};

const metaEnv: FactoryEnv = {
  WHATSAPP_PROVIDER: "meta",
  META_WA_PHONE_NUMBER_ID: "1067269249811291",
  META_WA_ACCESS_TOKEN: "EAAtest",
};

describe("resolveProvider", () => {
  it("retorna twilio quando env é undefined", () => {
    expect(resolveProvider(undefined)).toBe("twilio");
  });

  it("retorna twilio quando env é string vazia", () => {
    expect(resolveProvider("")).toBe("twilio");
  });

  it("retorna twilio com qualquer case", () => {
    expect(resolveProvider("twilio")).toBe("twilio");
    expect(resolveProvider("TWILIO")).toBe("twilio");
    expect(resolveProvider("  Twilio  ")).toBe("twilio");
  });

  it("retorna meta", () => {
    expect(resolveProvider("meta")).toBe("meta");
    expect(resolveProvider("META")).toBe("meta");
  });

  it("rejeita provider desconhecido com mensagem clara", () => {
    expect(() => resolveProvider("infobip")).toThrow(/Unknown WHATSAPP_PROVIDER/);
    expect(() => resolveProvider("twilio_v2")).toThrow(/Unknown WHATSAPP_PROVIDER/);
  });
});

describe("buildAdapter", () => {
  it("default é Twilio quando env não tem WHATSAPP_PROVIDER", () => {
    const a = buildAdapter(twilioEnv);
    expect(a).toBeInstanceOf(TwilioAdapter);
    expect(a.provider).toBe("twilio");
  });

  it("Twilio explícito", () => {
    const a = buildAdapter({ ...twilioEnv, WHATSAPP_PROVIDER: "twilio" });
    expect(a).toBeInstanceOf(TwilioAdapter);
  });

  it("Meta quando WHATSAPP_PROVIDER=meta", () => {
    const a = buildAdapter(metaEnv);
    expect(a).toBeInstanceOf(MetaAdapter);
    expect(a.provider).toBe("meta");
  });

  it("rejeita Twilio sem secrets", () => {
    expect(() => buildAdapter({})).toThrow(/TWILIO_ACCOUNT_SID/);
    expect(() => buildAdapter({ TWILIO_ACCOUNT_SID: "x" })).toThrow(/TWILIO/);
  });

  it("rejeita Meta sem secrets", () => {
    expect(() => buildAdapter({ WHATSAPP_PROVIDER: "meta" })).toThrow(
      /META_WA_PHONE_NUMBER_ID/,
    );
  });

  it("propaga erro de provider desconhecido", () => {
    expect(() =>
      buildAdapter({ ...twilioEnv, WHATSAPP_PROVIDER: "nexmo" }),
    ).toThrow(/Unknown WHATSAPP_PROVIDER/);
  });
});

describe("parseOutgoing", () => {
  it("aceita body legado {to,message} como freeform", () => {
    const out = parseOutgoing({ to: "+5561999743974", message: "oi" });
    expect(out.kind).toBe("freeform");
    if (out.kind === "freeform") {
      expect(out.to).toBe("+5561999743974");
      expect(out.message).toBe("oi");
    }
  });

  it("aceita body novo {to,template} como template", () => {
    const out = parseOutgoing({
      to: "+5561999743974",
      template: { name: "hello_world", language: "en_US" },
    });
    expect(out.kind).toBe("template");
    if (out.kind === "template") {
      expect(out.template.name).toBe("hello_world");
      expect(out.template.language).toBe("en_US");
      expect(out.template.components).toBeUndefined();
    }
  });

  it("preserva components do template tal qual", () => {
    const components = [
      {
        type: "body",
        parameters: [{ type: "text", text: "Maria" }],
      },
    ];
    const out = parseOutgoing({
      to: "+5561",
      template: { name: "x", language: "pt_BR", components },
    });
    if (out.kind === "template") {
      expect(out.template.components).toEqual(components);
    }
  });

  it("template prevalece sobre message quando ambos presentes", () => {
    const out = parseOutgoing({
      to: "+5561",
      message: "ignorado",
      template: { name: "x", language: "pt_BR" },
    });
    expect(out.kind).toBe("template");
  });

  it("rejeita body sem 'to'", () => {
    expect(() => parseOutgoing({ message: "x" })).toThrow(WhatsappBodyError);
    expect(() => parseOutgoing({ message: "x" })).toThrow(/'to'/);
  });

  it("rejeita body sem 'to' nem template/message", () => {
    expect(() => parseOutgoing({ to: "+5561" })).toThrow(/'message'/);
  });

  it("rejeita template sem name ou language", () => {
    expect(() =>
      parseOutgoing({ to: "+5561", template: { language: "pt_BR" } }),
    ).toThrow(/template.name/);
    expect(() =>
      parseOutgoing({ to: "+5561", template: { name: "x" } }),
    ).toThrow(/template.language/);
  });

  it("rejeita components não-array", () => {
    expect(() =>
      parseOutgoing({
        to: "+5561",
        template: { name: "x", language: "pt_BR", components: "oops" },
      }),
    ).toThrow(/array/);
  });

  it("rejeita body não-objeto", () => {
    expect(() => parseOutgoing(null)).toThrow(WhatsappBodyError);
    expect(() => parseOutgoing("oi")).toThrow(WhatsappBodyError);
    expect(() => parseOutgoing(123)).toThrow(WhatsappBodyError);
  });
});
