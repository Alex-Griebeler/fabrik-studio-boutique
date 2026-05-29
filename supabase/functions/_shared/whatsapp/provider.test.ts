import { describe, expect, it } from "vitest";
import { providerForSid } from "./provider";

describe("providerForSid", () => {
  it("infere meta por prefixo wamid. quando coluna null", () => {
    expect(providerForSid(null, "wamid.HBgM")).toBe("meta");
  });

  it("infere twilio por prefixo SM quando coluna null", () => {
    expect(providerForSid(null, "SMabc123")).toBe("twilio");
  });

  it("coluna 'meta' vence sobre prefixo SM", () => {
    expect(providerForSid("meta", "SMabc123")).toBe("meta");
  });

  it("coluna 'twilio' vence sobre prefixo wamid.", () => {
    expect(providerForSid("twilio", "wamid.X")).toBe("twilio");
  });

  it("undefined trata como null (infere por prefixo)", () => {
    expect(providerForSid(undefined, "wamid.Y")).toBe("meta");
    expect(providerForSid(undefined, "SMz")).toBe("twilio");
  });

  it("coluna desconhecida cai pra inferência por prefixo", () => {
    // valor inesperado na coluna → não é 'meta' nem 'twilio' → infere
    expect(providerForSid("legacy", "wamid.W")).toBe("meta");
    expect(providerForSid("", "SMq")).toBe("twilio");
  });
});

// Objetivo 2.4/2.5 (refresh com provider Meta NÃO chama Twilio e
// retorna `meta_status_via_webhook`; item Twilio segue fluxo Twilio) é
// garantido ESTRUTURALMENTE em refresh-attendance-message-status:
//   - `refreshOne` faz `if (provider === "meta") return {...note:
//     "meta_status_via_webhook"}` ANTES de qualquer fetch/Twilio.
//   - o ramo Twilio só roda quando `provider === "twilio"`, e tem guard
//     de env ausente que registra erro por item sem chamar fetch.
// A DECISÃO (qual provider) é o que `providerForSid` resolve — coberto
// acima. Testar `refreshOne` ponta-a-ponta exigiria mockar o client
// Supabase + fetch dentro de uma edge function Deno, fora do escopo
// destes testes puros (limitação registrada no relatório).
