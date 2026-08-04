import { describe, expect, it } from "vitest";

import { bearerToken, isServiceRoleKey, timingSafeEqual } from "./serviceRoleAuth";

const SERVICE_KEY = "service-role-key-super-secreta";

/** Monta um JWT sintaticamente valido com o payload pedido. */
function jwt(payload: Record<string, unknown>, signature = "assinatura-qualquer") {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.${signature}`;
}

describe("isServiceRoleKey", () => {
  it("aceita exatamente a chave de serviço", () => {
    expect(isServiceRoleKey(SERVICE_KEY, SERVICE_KEY)).toBe(true);
  });

  // O buraco que esta PR fecha: o token abaixo passava nas 7 funções porque
  // a checagem antiga só lia `payload.role`, sem verificar a assinatura.
  it("REJEITA JWT forjado que apenas afirma ser service_role", () => {
    const forjado = jwt({ role: "service_role" });

    expect(isServiceRoleKey(forjado, SERVICE_KEY)).toBe(false);
  });

  it.each([
    ["assinatura vazia", jwt({ role: "service_role" }, "")],
    ["com sub e exp plausíveis", jwt({ role: "service_role", sub: "x", exp: 9999999999 })],
    ["role em maiúscula", jwt({ role: "SERVICE_ROLE" })],
    ["role aninhada", jwt({ app_metadata: { role: "service_role" } })],
  ])("rejeita variação forjada: %s", (_label, token) => {
    expect(isServiceRoleKey(token, SERVICE_KEY)).toBe(false);
  });

  it("rejeita a chave anon, que é pública e vai no bundle do site", () => {
    expect(isServiceRoleKey("anon-key-publica", SERVICE_KEY)).toBe(false);
  });

  it.each([
    ["token vazio", "", SERVICE_KEY],
    ["token nulo", null, SERVICE_KEY],
    ["token indefinido", undefined, SERVICE_KEY],
    // Sem a env configurada nada pode ser aceito — senão um ambiente mal
    // provisionado autorizaria chamada sem credencial.
    ["chave de serviço ausente", SERVICE_KEY, undefined],
    ["chave de serviço vazia", SERVICE_KEY, ""],
    ["ambos vazios", "", ""],
  ])("nega quando %s", (_label, token, key) => {
    expect(isServiceRoleKey(token, key)).toBe(false);
  });

  it("rejeita chave quase certa (prefixo e sufixo)", () => {
    expect(isServiceRoleKey(SERVICE_KEY.slice(0, -1), SERVICE_KEY)).toBe(false);
    expect(isServiceRoleKey(SERVICE_KEY + "x", SERVICE_KEY)).toBe(false);
  });
});

describe("timingSafeEqual", () => {
  it("compara conteúdo, não referência", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("percorre o maior dos dois (tamanho diferente não retorna cedo)", () => {
    expect(timingSafeEqual("a", "a".repeat(500))).toBe(false);
  });
});

describe("bearerToken", () => {
  it("extrai o token do header", () => {
    expect(bearerToken("Bearer abc123")).toBe("abc123");
  });

  it("apara espaços em volta do token", () => {
    expect(bearerToken("Bearer   abc123  ")).toBe("abc123");
  });

  it.each([
    ["header ausente", undefined],
    ["header nulo", null],
    ["header vazio", ""],
    ["sem o prefixo Bearer", "abc123"],
    ["prefixo em minúscula", "bearer abc123"],
    ["outro esquema", "Basic abc123"],
  ])("devolve string vazia quando %s", (_label, header) => {
    expect(bearerToken(header)).toBe("");
  });
});
