import { describe, expect, it } from "vitest";

import { policyAllowsLive, resolveEffectiveMode } from "./mode";

describe("resolveEffectiveMode — matriz policy × linha", () => {
  // A regra inteira em forma de tabela: `live` exige AMBOS `live`.
  it.each([
    // policy,   linha,     esperado
    ["live", "live", "live"],
    ["live", "shadow", "shadow"],
    ["shadow", "live", "shadow"], // ← o furo que esta correção fecha
    ["shadow", "shadow", "shadow"],
  ])("policy=%s + linha=%s ⇒ %s", (policy, row, esperado) => {
    expect(resolveEffectiveMode(policy, row)).toBe(esperado);
  });

  // O caso que motivou a mudança, isolado: um alerta gravado como `live`
  // (inclusive por chamada antiga com forceMode:"live", quando isso passava)
  // não pode ser entregue depois que o agente voltou para shadow.
  it("alerta live pendente NÃO é enviado com o agente em shadow", () => {
    expect(resolveEffectiveMode("shadow", "live")).toBe("shadow");
  });

  it("a linha pode reduzir o alcance mesmo com a policy em live", () => {
    expect(resolveEffectiveMode("live", "shadow")).toBe("shadow");
  });

  // Fail-safe: qualquer coisa que não seja exatamente "live" vira shadow.
  it.each([
    ["policy nula", null, "live"],
    ["policy indefinida", undefined, "live"],
    ["policy vazia", "", "live"],
    ["policy com espaço", " live", "live"],
    ["policy em maiúscula", "LIVE", "live"],
    ["policy desconhecida", "producao", "live"],
    ["linha nula", "live", null],
    ["linha indefinida", "live", undefined],
    ["linha vazia", "live", ""],
    ["linha em maiúscula", "live", "LIVE"],
    ["linha desconhecida", "live", "ativo"],
    ["ambos nulos", null, null],
  ])("trata %s como shadow", (_label, policy, row) => {
    expect(resolveEffectiveMode(policy, row)).toBe("shadow");
  });
});

describe("policyAllowsLive", () => {
  it("só o literal 'live' autoriza envio real", () => {
    expect(policyAllowsLive("live")).toBe(true);
  });

  it.each([["shadow"], [""], [null], [undefined], ["LIVE"], [" live"], ["true"]])(
    "nega %s",
    (value) => {
      expect(policyAllowsLive(value as string | null | undefined)).toBe(false);
    },
  );
});
