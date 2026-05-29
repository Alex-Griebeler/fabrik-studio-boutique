import { describe, expect, it } from "vitest";
import {
  normalizeMetaStatus,
  parseMetaWebhookPayload,
  verifyMetaSignature,
  verifyMetaSubscription,
} from "./metaWebhook";

describe("verifyMetaSubscription", () => {
  it("retorna challenge quando mode+token batem", () => {
    expect(
      verifyMetaSubscription({
        mode: "subscribe",
        token: "segredo123",
        challenge: "CH4LL",
        expectedToken: "segredo123",
      }),
    ).toBe("CH4LL");
  });

  it("retorna null com token errado", () => {
    expect(
      verifyMetaSubscription({
        mode: "subscribe",
        token: "errado",
        challenge: "CH4LL",
        expectedToken: "segredo123",
      }),
    ).toBeNull();
  });

  it("retorna null com mode != subscribe", () => {
    expect(
      verifyMetaSubscription({
        mode: "unsubscribe",
        token: "segredo123",
        challenge: "CH4LL",
        expectedToken: "segredo123",
      }),
    ).toBeNull();
  });

  it("retorna null quando expectedToken ausente", () => {
    expect(
      verifyMetaSubscription({
        mode: "subscribe",
        token: "x",
        challenge: "CH4LL",
        expectedToken: undefined,
      }),
    ).toBeNull();
  });
});

describe("parseMetaWebhookPayload", () => {
  it("extrai statuses[] de entry/changes/value", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA",
          changes: [
            {
              field: "messages",
              value: {
                statuses: [
                  { id: "wamid.AAA", status: "delivered" },
                  { id: "wamid.BBB", status: "read" },
                ],
              },
            },
          ],
        },
      ],
    };
    const parsed = parseMetaWebhookPayload(payload);
    expect(parsed.statuses).toHaveLength(2);
    expect(parsed.statuses[0].id).toBe("wamid.AAA");
    expect(parsed.inboundMessages).toHaveLength(0);
  });

  it("conta messages[] inbound sem processar", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  { id: "wamid.IN1", from: "5561...", type: "text" },
                ],
              },
            },
          ],
        },
      ],
    };
    const parsed = parseMetaWebhookPayload(payload);
    expect(parsed.inboundMessages).toHaveLength(1);
    expect(parsed.statuses).toHaveLength(0);
  });

  it("ignora changes com field != messages", () => {
    const payload = {
      entry: [
        {
          changes: [
            { field: "account_review_update", value: { decision: "APPROVED" } },
          ],
        },
      ],
    };
    const parsed = parseMetaWebhookPayload(payload);
    expect(parsed.statuses).toHaveLength(0);
    expect(parsed.inboundMessages).toHaveLength(0);
  });

  it("tolera payloads malformados sem lançar", () => {
    expect(parseMetaWebhookPayload(null).statuses).toHaveLength(0);
    expect(parseMetaWebhookPayload("texto").statuses).toHaveLength(0);
    expect(parseMetaWebhookPayload({}).statuses).toHaveLength(0);
    expect(parseMetaWebhookPayload({ entry: "x" }).statuses).toHaveLength(0);
    expect(
      parseMetaWebhookPayload({ entry: [{ changes: null }] }).statuses,
    ).toHaveLength(0);
  });
});

describe("normalizeMetaStatus", () => {
  it("normaliza status simples", () => {
    const n = normalizeMetaStatus({ id: "wamid.X", status: "DELIVERED" });
    expect(n.wamid).toBe("wamid.X");
    expect(n.status).toBe("delivered");
    expect(n.errorCode).toBeNull();
    expect(n.errorMessage).toBeNull();
  });

  it("extrai erro de failed com errors[]", () => {
    const n = normalizeMetaStatus({
      id: "wamid.F",
      status: "failed",
      errors: [
        {
          code: 131030,
          title: "Recipient not in allowed list",
          error_data: { details: "Add the number to the test recipients." },
        },
      ],
    });
    expect(n.status).toBe("failed");
    expect(n.errorCode).toBe("131030");
    expect(n.errorMessage).toBe("Add the number to the test recipients.");
  });

  it("cai pra message/title quando não há error_data.details", () => {
    const n = normalizeMetaStatus({
      id: "wamid.F",
      status: "failed",
      errors: [{ code: 131049, message: "Per-user limit" }],
    });
    expect(n.errorCode).toBe("131049");
    expect(n.errorMessage).toBe("Per-user limit");
  });

  it("wamid null quando id ausente", () => {
    const n = normalizeMetaStatus({ status: "sent" });
    expect(n.wamid).toBeNull();
    expect(n.status).toBe("sent");
  });
});

describe("verifyMetaSignature", () => {
  // HMAC-SHA256 de '{"a":1}' com secret 'topsecret', pré-computado.
  // Gerado com: openssl dgst -sha256 -hmac topsecret
  const body = '{"a":1}';
  const secret = "topsecret";
  // hex esperado (validado pelo próprio algoritmo no 1º teste abaixo)
  let validHex = "";

  it("aceita assinatura válida (round-trip do próprio algoritmo)", async () => {
    // Gera a assinatura correta usando a mesma WebCrypto, depois valida.
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
    validHex = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const ok = await verifyMetaSignature(body, `sha256=${validHex}`, secret);
    expect(ok).toBe(true);
  });

  it("rejeita assinatura com hex errado", async () => {
    const ok = await verifyMetaSignature(
      body,
      "sha256=deadbeef",
      secret,
    );
    expect(ok).toBe(false);
  });

  it("rejeita secret errado", async () => {
    const ok = await verifyMetaSignature(body, `sha256=${validHex}`, "wrong");
    expect(ok).toBe(false);
  });

  it("rejeita body adulterado", async () => {
    const ok = await verifyMetaSignature(
      '{"a":2}',
      `sha256=${validHex}`,
      secret,
    );
    expect(ok).toBe(false);
  });

  it("rejeita header ausente ou sem prefixo sha256=", async () => {
    expect(await verifyMetaSignature(body, null, secret)).toBe(false);
    expect(await verifyMetaSignature(body, "abc123", secret)).toBe(false);
    expect(await verifyMetaSignature(body, "sha1=abc", secret)).toBe(false);
  });

  it("rejeita appSecret ausente", async () => {
    expect(await verifyMetaSignature(body, `sha256=${validHex}`, null)).toBe(
      false,
    );
  });

  it("rejeita hex não-hexadecimal", async () => {
    expect(await verifyMetaSignature(body, "sha256=zzzz", secret)).toBe(false);
    expect(await verifyMetaSignature(body, "sha256=", secret)).toBe(false);
  });
});
