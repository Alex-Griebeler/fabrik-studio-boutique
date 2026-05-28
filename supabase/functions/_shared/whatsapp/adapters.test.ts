import { afterEach, describe, expect, it, vi } from "vitest";
import { TwilioAdapter } from "./twilio";
import { MetaAdapter } from "./meta";

// Helpers — Response synthetic com JSON body
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TwilioAdapter", () => {
  const config = {
    accountSid: "AC123",
    authToken: "tok-secret",
    fromNumber: "+14155238886",
  };

  it("envia freeform com URL e Basic Auth corretos", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ sid: "SMxxx", status: "queued" }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new TwilioAdapter(config);
    const result = await adapter.send({
      kind: "freeform",
      to: "+5561999743974",
      message: "Olá",
    });

    expect(result).toEqual({ sid: "SMxxx", status: "queued" });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toMatch(
      /^Basic /,
    );

    const bodyStr = String(init.body);
    const params = new URLSearchParams(bodyStr);
    expect(params.get("To")).toBe("whatsapp:+5561999743974");
    expect(params.get("From")).toBe("whatsapp:+14155238886");
    expect(params.get("Body")).toBe("Olá");
  });

  it("preserva prefix whatsapp: se já vier", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ sid: "SMy", status: "queued" }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new TwilioAdapter({
      ...config,
      fromNumber: "whatsapp:+14155238886",
    });
    await adapter.send({
      kind: "freeform",
      to: "whatsapp:+5561",
      message: "x",
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const params = new URLSearchParams(String(init.body));
    expect(params.get("To")).toBe("whatsapp:+5561");
    expect(params.get("From")).toBe("whatsapp:+14155238886");
  });

  it("rejeita template com erro claro", async () => {
    const adapter = new TwilioAdapter(config);
    await expect(
      adapter.send({
        kind: "template",
        to: "+5561",
        template: { name: "x", language: "pt_BR" },
      }),
    ).rejects.toThrow(/Twilio adapter does not support template/);
  });

  it("propaga erro HTTP do Twilio com code+message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { code: 63015, message: "Channel could not be reached" },
          400,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new TwilioAdapter(config);
    await expect(
      adapter.send({ kind: "freeform", to: "+5561", message: "x" }),
    ).rejects.toThrow(/63015.*Channel could not be reached/);
  });
});

describe("MetaAdapter", () => {
  const config = {
    phoneNumberId: "1067269249811291",
    accessToken: "EAAtoken",
  };

  it("envia template com body Graph correto e mapeia wamid → sid", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        messaging_product: "whatsapp",
        contacts: [{ input: "+5561999743974", wa_id: "556199743974" }],
        messages: [{ id: "wamid.HBgM...", message_status: "accepted" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new MetaAdapter(config);
    const result = await adapter.send({
      kind: "template",
      to: "+5561999743974",
      template: { name: "hello_world", language: "en_US" },
    });

    expect(result).toEqual({ sid: "wamid.HBgM...", status: "accepted" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://graph.facebook.com/v25.0/1067269249811291/messages",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer EAAtoken",
    );

    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      messaging_product: "whatsapp",
      to: "+5561999743974",
      type: "template",
      template: {
        name: "hello_world",
        language: { code: "en_US" },
      },
    });
  });

  it("inclui components quando fornecido", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ messages: [{ id: "wamid.X", message_status: "accepted" }] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new MetaAdapter(config);
    const components = [
      { type: "body", parameters: [{ type: "text", text: "Maria" }] },
    ];
    await adapter.send({
      kind: "template",
      to: "+5561",
      template: { name: "x", language: "pt_BR", components },
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.template.components).toEqual(components);
  });

  it("remove prefix whatsapp: se vier", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ messages: [{ id: "wamid.X", message_status: "accepted" }] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new MetaAdapter(config);
    await adapter.send({
      kind: "template",
      to: "whatsapp:+5561",
      template: { name: "x", language: "pt_BR" },
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.to).toBe("+5561");
  });

  it("usa apiVersion customizado se fornecido", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ messages: [{ id: "wamid.X", message_status: "accepted" }] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new MetaAdapter({ ...config, apiVersion: "v23.0" });
    await adapter.send({
      kind: "template",
      to: "+5561",
      template: { name: "x", language: "pt_BR" },
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/v23.0/");
  });

  it("rejeita freeform com erro claro", async () => {
    const adapter = new MetaAdapter(config);
    await expect(
      adapter.send({ kind: "freeform", to: "+5561", message: "oi" }),
    ).rejects.toThrow(/template/i);
  });

  it("propaga erro HTTP com code+message da Meta", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            message: "Recipient phone number not in allowed list",
            code: 131030,
          },
        },
        400,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new MetaAdapter(config);
    await expect(
      adapter.send({
        kind: "template",
        to: "+5599",
        template: { name: "x", language: "pt_BR" },
      }),
    ).rejects.toThrow(/131030.*allowed list/);
  });
});
