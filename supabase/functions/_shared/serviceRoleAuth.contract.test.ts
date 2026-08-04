// Barreira estrutural contra reintrodução do bypass de JWT forjado.
//
// Os handlers destas sete funções não são testáveis por unidade hoje: são
// `Deno.serve` com import de VALOR de esm.sh no topo, fora do glob do vitest.
// Sem isto, uma mutação na FIAÇÃO de um único handler — reintroduzir a função
// insegura, trocar um `!`, remover o import — passaria com a suíte inteira
// verde, porque os testes do helper continuariam corretos.
//
// Este arquivo lê o código-fonte das sete e afirma propriedades sobre ele.
// Não substitui teste de handler; fecha a lacuna que o torna caro.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Já migradas para `requireInternalAuth` (A3.2): a decisão saiu do handler e
 * passou a ter teste de comportamento em `internalAuth.test.ts`.
 */
const FUNCOES_COM_HELPER = [
  "detect-attendance-risk",
  "escalate-attendance-alerts",
  "attendance-prelive-check",
  "attendance-channel-healthcheck",
  "refresh-attendance-message-status",
  "detect-churn-risk",
] as const;

/** Ainda com a decisão inline no handler — migração A3.2 em curso. */
const FUNCOES_LEGADO = [
  "sync-evo-attendance",
] as const;

/** As sete que reconheciam chamada interna pelo conteúdo do JWT. */
const FUNCOES_COM_SERVICE_ROLE = [
  ...FUNCOES_COM_HELPER,
  ...FUNCOES_LEGADO,
] as const;

function source(fn: string): string {
  return readFileSync(
    join(process.cwd(), "supabase", "functions", fn, "index.ts"),
    "utf-8",
  );
}

describe.each(FUNCOES_COM_SERVICE_ROLE)("%s", (fn) => {
  const code = source(fn);

  // O furo era decodificar o payload e confiar no campo `role`. As asserções
  // abaixo são deliberadamente amplas: nenhuma das sete usa `atob` nem a
  // string `service_role` para qualquer fim legítimo (verificado), então
  // proibir as duas fecha a classe inteira do bug — e não apenas a forma
  // exata em que ele apareceu. Uma reescrita astuta do bypass também morre.
  it("não decodifica nada do JWT para decidir se é service_role", () => {
    expect(code).not.toMatch(/function\s+isServiceRoleJwt/);
    expect(code).not.toMatch(/isServiceRoleJwt\s*\(/);
    expect(code).not.toMatch(/\batob\s*\(/);
    expect(code).not.toMatch(/["']service_role["']/);
    expect(code).not.toMatch(/\.\s*role\s*===/);
    expect(code).not.toMatch(/token\s*\.\s*split\s*\(\s*["']\.["']\s*\)/);
  });

  // A comparação crua sobreviveria à revisão, mas vaza por latência; o helper
  // é o único caminho aprovado.
  it("não compara o token com a chave fora do helper", () => {
    expect(code).not.toMatch(/token\s*===\s*serviceKey/);
    expect(code).not.toMatch(/token\s*!==\s*serviceKey/);
  });

  it("não despeja o payload do JWT no log", () => {
    expect(code).not.toMatch(/console\.log\([^)]*payload/i);
  });
});

describe.each(FUNCOES_LEGADO)("%s (decisão ainda inline)", (fn) => {
  const code = source(fn);

  it("usa o helper compartilhado com comparação em tempo constante", () => {
    expect(code).toContain("isServiceRoleKey");
    expect(code).toMatch(/from\s+["']\.\.\/_shared\/serviceRoleAuth\.ts["']/);
  });
});

// Depois da migração as asserções deixam de ser sobre a FORMA do bypass e
// passam a ser sobre a AUSÊNCIA de decisão no handler: sem booleano mutável,
// sem consulta de role, sem leitura de chave. Quem edita o handler não tem
// mais como conceder acesso — só como deixar de encaminhar a negação, e isso
// não compila (`auth` seria usado como união com `Response`).
describe.each(FUNCOES_COM_HELPER)("%s (migrada para requireInternalAuth)", (fn) => {
  const code = source(fn);

  it("delega a decisão ao helper", () => {
    expect(code).toContain("requireInternalAuth");
    expect(code).toMatch(/from\s+["']\.\.\/_shared\/internalAuth\.ts["']/);
  });

  it("encaminha a negação sem reinterpretá-la", () => {
    expect(code).toMatch(/if\s*\(\s*auth\s+instanceof\s+Response\s*\)\s*return\s+auth\s*;/);
  });

  it("não guarda a autorização em variável mutável", () => {
    expect(code).not.toMatch(/\blet\s+(authorized|isServiceRole|cronAuthorized)\b/);
    expect(code).not.toMatch(/^\s*(authorized|isServiceRole)\s*=/m);
  });

  it("não refaz nenhuma etapa da decisão por fora do helper", () => {
    expect(code).not.toContain("isServiceRoleKey");
    expect(code).not.toContain("hasValidAttendanceCronSecret");
    expect(code).not.toContain("SUPABASE_ANON_KEY");
    expect(code).not.toContain("user_roles");
  });
});

describe("detect-attendance-risk — trava do modo", () => {
  const code = source("detect-attendance-risk");

  it("não deixa forceMode escolher o modo diretamente", () => {
    expect(code).not.toMatch(/body\.forceMode\s*\?\?\s*policies\.mode/);
  });

  it("só aceita forceMode para reduzir para shadow", () => {
    expect(code).toMatch(/body\.forceMode\s*===\s*["']shadow["']/);
  });

  it("resolve o modo de envio pela policy atual, não pelo modo da linha", () => {
    expect(code).toContain("resolveEffectiveMode");
    expect(code).not.toMatch(/mode:\s*row\.mode\b/);
  });
});

describe("escalate-attendance-alerts — trava do modo", () => {
  const code = source("escalate-attendance-alerts");

  it("carrega a policy de modo do agente", () => {
    expect(code).toContain("attendance_agent.mode");
  });

  it("decide o destino pelo modo efetivo, não pelo modo da linha", () => {
    expect(code).toContain("resolveEffectiveMode");
    expect(code).not.toMatch(/a\.mode\s*===\s*["']shadow["']/);
  });
});
