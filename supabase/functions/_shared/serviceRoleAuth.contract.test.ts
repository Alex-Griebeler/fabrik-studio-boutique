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
 * As sete que reconheciam chamada interna pelo conteúdo do JWT. Desde A3.2
 * todas delegam a decisão a `requireInternalAuth`, que tem teste de
 * comportamento em `internalAuth.test.ts`.
 */
const FUNCOES_COM_SERVICE_ROLE = [
  "detect-attendance-risk",
  "escalate-attendance-alerts",
  "attendance-prelive-check",
  "attendance-channel-healthcheck",
  "refresh-attendance-message-status",
  "detect-churn-risk",
  "sync-evo-attendance",
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

// Depois da migração as asserções deixam de ser sobre a FORMA do bypass e
// passam a ser sobre a AUSÊNCIA de decisão no handler: sem booleano mutável,
// sem consulta de role, sem leitura de chave.
describe.each(FUNCOES_COM_SERVICE_ROLE)("%s (autorização via helper)", (fn) => {
  const code = source(fn);

  it("delega a decisão ao helper", () => {
    expect(code).toContain("requireInternalAuth");
    expect(code).toMatch(/from\s+["']\.\.\/_shared\/internalAuth\.ts["']/);
  });

  it("encaminha a negação sem reinterpretá-la", () => {
    expect(code).toMatch(/if\s*\(\s*auth\s+instanceof\s+Response\s*\)\s*return\s+auth\s*;/);
  });

  // Esta asserção dá dentes à anterior, num caso específico: apagar o `return`
  // DEIXANDO o guard no lugar. Sem consumir o contexto isso compila numa boa
  // (`auth` fica inutilizado e o TS não tem do que reclamar — verificado);
  // lendo `auth.via` depois do guard, vira TS2339 e morre no `deno check`.
  //
  // LIMITE, para não vender o que não entrega: isto cobre a forma inline que
  // as sete usam hoje. NÃO cobre alguém extrair o guard para uma função
  // auxiliar no mesmo arquivo e esquecer de propagar o retorno dela —
  // `await checkAuth(req);` sem `return` continua compilando e ainda casa com
  // as regex daqui. Fechar isso exige inverter o controle (um wrapper que só
  // chama o corpo privilegiado depois de autorizar), que é mudança de desenho,
  // não de fiação. Registrado como dívida na PR.
  it("consome o contexto autorizado, tornando o guard verificável pelo compilador", () => {
    expect(code).toMatch(/\bauth\.via\b/);
  });
});

// Amarra cada função ao SEU perfil. Sem isto, trocar `allowAdminUser` de false
// para true num handler — abrindo uma porta que aquela função nunca teve —
// não quebraria teste nenhum: os testes do helper só provam que o helper honra
// as flags que recebe, não que cada função passa as flags certas.
const PERFIS = {
  "detect-attendance-risk": {
    cron: true,
    admin: true,
    missing: [401, "Missing Authorization"],
    insufficient: [403, "Service-role required"],
  },
  "escalate-attendance-alerts": {
    cron: true,
    admin: false,
    missing: [401, "Missing Authorization"],
    insufficient: [403, "Service-role required"],
  },
  "attendance-prelive-check": {
    cron: true,
    admin: true,
    missing: [401, "Unauthorized"],
    insufficient: [401, "Unauthorized"],
  },
  "attendance-channel-healthcheck": {
    cron: true,
    admin: false,
    missing: [401, "Missing Authorization or cron secret"],
    insufficient: [403, "Service-role required"],
  },
  "refresh-attendance-message-status": {
    cron: false,
    admin: true,
    missing: [401, "Missing Authorization"],
    insufficient: [403, "Service-role or admin required"],
  },
  "detect-churn-risk": {
    cron: true,
    admin: true,
    missing: [401, "Unauthorized"],
    insufficient: [401, "Unauthorized"],
  },
  "sync-evo-attendance": {
    cron: true,
    admin: false,
    missing: [401, "Missing Authorization or cron secret"],
    insufficient: [403, "Service-role required"],
  },
} as const satisfies Record<
  (typeof FUNCOES_COM_SERVICE_ROLE)[number],
  {
    cron: boolean;
    admin: boolean;
    missing: readonly [number, string];
    insufficient: readonly [number, string];
  }
>;

function denialRegex(campo: string, [status, mensagem]: readonly [number, string]) {
  return new RegExp(
    `${campo}:\\s*\\{\\s*status:\\s*${status},\\s*message:\\s*"${mensagem}"\\s*\\}`,
  );
}

describe.each(Object.entries(PERFIS))("%s (perfil)", (fn, perfil) => {
  const code = source(fn);

  it(`${perfil.cron ? "aceita" : "não aceita"} o segredo do cron`, () => {
    if (perfil.cron) {
      expect(code).toMatch(/allowCronSecret:\s*true/);
    } else {
      expect(code).not.toContain("allowCronSecret");
    }
  });

  it(`${perfil.admin ? "aceita" : "não aceita"} usuário admin`, () => {
    if (perfil.admin) {
      expect(code).toMatch(/allowAdminUser:\s*true/);
    } else {
      expect(code).not.toContain("allowAdminUser");
    }
  });

  it("preserva status e mensagem das duas negações", () => {
    expect(code).toMatch(denialRegex("missing", perfil.missing));
    expect(code).toMatch(denialRegex("insufficient", perfil.insufficient));
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
