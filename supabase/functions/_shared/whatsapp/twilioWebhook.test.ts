import { describe, expect, it } from "vitest";
import {
  computeTwilioSignature,
  resolveTwilioWebhookUrl,
  verifyTwilioSignature,
} from "./twilioWebhook";

// Vetor known-answer da documentação oficial da Twilio ("Validating
// Signatures"): protege contra bug espelhado (mesma falha na
// implementação e no teste).
const DOC_URL = "https://mycompany.com/myapp.php?foo=1&bar=2";
const DOC_TOKEN = "12345";
const DOC_PARAMS: Record<string, string> = {
  CallSid: "CA1234567890ABCDE",
  Caller: "+12349013030",
  Digits: "1234",
  From: "+12349013030",
  To: "+18005551212",
};
const DOC_SIGNATURE = "0/KCTR6DLpKmkAf8muzZqo1nDgQ=";

describe("computeTwilioSignature", () => {
  it("reproduz o vetor known-answer da documentação da Twilio", async () => {
    const sig = await computeTwilioSignature(DOC_URL, DOC_PARAMS, DOC_TOKEN);
    expect(sig).toBe(DOC_SIGNATURE);
  });

  it("é independente da ordem de inserção dos params (ordena por chave)", async () => {
    const shuffled: Record<string, string> = {
      To: "+18005551212",
      Digits: "1234",
      CallSid: "CA1234567890ABCDE",
      From: "+12349013030",
      Caller: "+12349013030",
    };
    const sig = await computeTwilioSignature(DOC_URL, shuffled, DOC_TOKEN);
    expect(sig).toBe(DOC_SIGNATURE);
  });

  it("muda se a query string da URL mudar", async () => {
    const sig = await computeTwilioSignature(
      "https://mycompany.com/myapp.php?foo=1&bar=3",
      DOC_PARAMS,
      DOC_TOKEN,
    );
    expect(sig).not.toBe(DOC_SIGNATURE);
  });
});

describe("verifyTwilioSignature", () => {
  const valid = {
    url: DOC_URL,
    params: DOC_PARAMS,
    signatureHeader: DOC_SIGNATURE,
    authToken: DOC_TOKEN,
  };

  it("aceita assinatura válida", async () => {
    expect(await verifyTwilioSignature(valid)).toBe(true);
  });

  it("aceita header com espaços nas bordas", async () => {
    expect(
      await verifyTwilioSignature({ ...valid, signatureHeader: ` ${DOC_SIGNATURE} ` }),
    ).toBe(true);
  });

  it("rejeita assinatura adulterada", async () => {
    const tampered = DOC_SIGNATURE.replace(/^./, DOC_SIGNATURE[0] === "A" ? "B" : "A");
    expect(
      await verifyTwilioSignature({ ...valid, signatureHeader: tampered }),
    ).toBe(false);
  });

  it("rejeita header ausente, vazio ou só espaços", async () => {
    expect(await verifyTwilioSignature({ ...valid, signatureHeader: null })).toBe(false);
    expect(await verifyTwilioSignature({ ...valid, signatureHeader: undefined })).toBe(false);
    expect(await verifyTwilioSignature({ ...valid, signatureHeader: "" })).toBe(false);
    expect(await verifyTwilioSignature({ ...valid, signatureHeader: "   " })).toBe(false);
  });

  it("rejeita token ausente ou vazio", async () => {
    expect(await verifyTwilioSignature({ ...valid, authToken: null })).toBe(false);
    expect(await verifyTwilioSignature({ ...valid, authToken: "" })).toBe(false);
  });

  it("rejeita URL vazia", async () => {
    expect(await verifyTwilioSignature({ ...valid, url: "" })).toBe(false);
  });

  it("rejeita quando o token é outro", async () => {
    expect(await verifyTwilioSignature({ ...valid, authToken: "54321" })).toBe(false);
  });

  it("rejeita quando params divergem (campo removido)", async () => {
    const { Digits: _omit, ...rest } = DOC_PARAMS;
    expect(await verifyTwilioSignature({ ...valid, params: rest })).toBe(false);
  });

  it("rejeita quando params divergem (valor alterado)", async () => {
    expect(
      await verifyTwilioSignature({
        ...valid,
        params: { ...DOC_PARAMS, Digits: "9999" },
      }),
    ).toBe(false);
  });

  it("rejeita assinatura de tamanho diferente (sem lançar)", async () => {
    expect(
      await verifyTwilioSignature({ ...valid, signatureHeader: "curta" }),
    ).toBe(false);
  });
});

describe("resolveTwilioWebhookUrl", () => {
  it("prefere a URL configurada quando presente", () => {
    expect(
      resolveTwilioWebhookUrl("https://canonical.example/hook", "https://req.example/hook"),
    ).toBe("https://canonical.example/hook");
  });

  it("usa a URL da request quando a config está ausente/vazia", () => {
    expect(resolveTwilioWebhookUrl(null, "https://req.example/hook")).toBe(
      "https://req.example/hook",
    );
    expect(resolveTwilioWebhookUrl(undefined, "https://req.example/hook")).toBe(
      "https://req.example/hook",
    );
    expect(resolveTwilioWebhookUrl("", "https://req.example/hook")).toBe(
      "https://req.example/hook",
    );
    expect(resolveTwilioWebhookUrl("   ", "https://req.example/hook")).toBe(
      "https://req.example/hook",
    );
  });
});
