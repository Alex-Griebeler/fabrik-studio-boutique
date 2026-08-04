// Contrato de autorização das sete funções de atendimento — verificado na
// ÁRVORE SINTÁTICA, não no texto do arquivo.
//
// POR QUE NÃO É MAIS TEXTUAL
//
// Este arquivo começou lendo o código como string e afirmando regex sobre ele.
// Duas auditorias seguidas mostraram que isso não é contrato, é tripwire:
//
//   - regex não distingue código de comentário: `// if (auth instanceof
//     Response) return auth;` satisfazia a exigência com o guard REMOVIDO;
//   - a tentativa de consertar removendo comentários com regex foi pior —
//     um `//` dentro de string apagava o código seguinte, e aí uma asserção
//     NEGATIVA passava a aceitar o que devia recusar (falha aberta);
//   - `allowAdminUser: true` montado por variável, spread ou aspas diferentes
//     escapava das regex de perfil;
//   - comparar posição textual de `.from(` não prova precedência: mover
//     `loadPolicies(supabase)` para antes do guard mantinha o `.from(` lá
//     embaixo, dentro da função declarada depois.
//
// Nada disso se conserta com regex melhor. O `typescript` já é devDependency,
// então aqui se usa o parser de verdade: comentários são trivia e somem
// sozinhos, strings são nós e não confundem nada, e "o que roda antes do quê"
// vira uma pergunta sobre a ordem dos nós — não sobre `indexOf`.
//
// O QUE ISTO PROVA
//
//   1. Dentro do `Deno.serve`, a PRIMEIRA coisa aguardada é
//      `requireInternalAuth`. Como todo efeito privilegiado destas funções é
//      assíncrono (banco, rede), nada privilegiado roda antes de autorizar —
//      inclusive através de helper, que é o furo que a checagem textual tinha.
//   2. Logo depois vem o guard, e ele devolve a negação.
//   3. As opções passadas são exatamente as do perfil da função — lidas do nó,
//      então formatação, aspas e comentário não influem, e indireção
//      (`...opts`, variável) é rejeitada explicitamente em vez de passar batido.
//   4. Nenhuma peça da decisão foi refeita no handler.
//
// LIMITE QUE PERMANECE: isto lê o código, não o executa. Prova a forma do
// handler, não o comportamento em produção. O comportamento de
// `requireInternalAuth` está em `internalAuth.test.ts`; o que nenhum dos dois
// cobre é o handler de ponta a ponta, que exigiria quebrar o import de valor
// de esm.sh no topo. Registrado como dívida na PR.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/** As sete que reconheciam chamada interna pelo conteúdo do JWT. */
const FUNCOES_COM_SERVICE_ROLE = [
  "detect-attendance-risk",
  "escalate-attendance-alerts",
  "attendance-prelive-check",
  "attendance-channel-healthcheck",
  "refresh-attendance-message-status",
  "detect-churn-risk",
  "sync-evo-attendance",
] as const;

type Funcao = (typeof FUNCOES_COM_SERVICE_ROLE)[number];

interface Perfil {
  cron: boolean;
  admin: boolean;
  missing: { status: number; message: string };
  insufficient: { status: number; message: string };
}

/**
 * Perfil de cada função, como estava em `main` antes da extração.
 *
 * Esta tabela é a razão de o contrato existir: os testes de
 * `internalAuth.test.ts` provam que o helper honra as flags que recebe, e
 * nenhum deles provaria que uma função passa as flags certas. Abrir
 * `allowAdminUser` numa função que só roda no cron não quebraria nada lá.
 */
const PERFIS: Record<Funcao, Perfil> = {
  "detect-attendance-risk": {
    cron: true,
    admin: true,
    missing: { status: 401, message: "Missing Authorization" },
    insufficient: { status: 403, message: "Service-role required" },
  },
  "escalate-attendance-alerts": {
    cron: true,
    admin: false,
    missing: { status: 401, message: "Missing Authorization" },
    insufficient: { status: 403, message: "Service-role required" },
  },
  "attendance-prelive-check": {
    cron: true,
    admin: true,
    missing: { status: 401, message: "Unauthorized" },
    insufficient: { status: 401, message: "Unauthorized" },
  },
  "attendance-channel-healthcheck": {
    cron: true,
    admin: false,
    missing: { status: 401, message: "Missing Authorization or cron secret" },
    insufficient: { status: 403, message: "Service-role required" },
  },
  "refresh-attendance-message-status": {
    cron: false,
    admin: true,
    missing: { status: 401, message: "Missing Authorization" },
    insufficient: { status: 403, message: "Service-role or admin required" },
  },
  "detect-churn-risk": {
    cron: true,
    admin: true,
    missing: { status: 401, message: "Unauthorized" },
    insufficient: { status: 401, message: "Unauthorized" },
  },
  "sync-evo-attendance": {
    cron: true,
    admin: false,
    missing: { status: 401, message: "Missing Authorization or cron secret" },
    insufficient: { status: 403, message: "Service-role required" },
  },
};

// ─────────────────────── Leitura da árvore ───────────────────────

function parse(fn: string): ts.SourceFile {
  const caminho = join(process.cwd(), "supabase", "functions", fn, "index.ts");
  return ts.createSourceFile(
    `${fn}/index.ts`,
    readFileSync(caminho, "utf-8"),
    ts.ScriptTarget.ESNext,
    true,
  );
}

/** Primeiro nó (em ordem de código) que satisfaz o predicado. */
function primeiro<T extends ts.Node>(
  raiz: ts.Node,
  aceita: (n: ts.Node) => n is T,
): T | undefined {
  let achado: T | undefined;
  const visitar = (n: ts.Node) => {
    if (achado) return;
    if (aceita(n)) {
      achado = n;
      return;
    }
    ts.forEachChild(n, visitar);
  };
  ts.forEachChild(raiz, visitar);
  return achado;
}

function todos(raiz: ts.Node, aceita: (n: ts.Node) => boolean): ts.Node[] {
  const out: ts.Node[] = [];
  const visitar = (n: ts.Node) => {
    if (aceita(n)) out.push(n);
    ts.forEachChild(n, visitar);
  };
  ts.forEachChild(raiz, visitar);
  return out;
}

/** Corpo do callback passado a `Deno.serve`. */
function corpoDoServe(sf: ts.SourceFile): ts.Node {
  const chamada = primeiro(sf, (n): n is ts.CallExpression =>
    ts.isCallExpression(n) && n.expression.getText(sf) === "Deno.serve",
  );
  if (!chamada) throw new Error("Deno.serve não encontrado");
  const cb = chamada.arguments[0];
  if (!cb || (!ts.isArrowFunction(cb) && !ts.isFunctionExpression(cb))) {
    throw new Error("callback de Deno.serve não é função");
  }
  if (!cb.body) throw new Error("callback sem corpo");
  return cb.body;
}

function nomeDaChamada(expr: ts.Expression, sf: ts.SourceFile): string {
  return ts.isCallExpression(expr) ? expr.expression.getText(sf) : "";
}

// ─────────────────────── Asserções ───────────────────────

describe.each(FUNCOES_COM_SERVICE_ROLE)("%s", (fn) => {
  const sf = parse(fn);
  const corpo = corpoDoServe(sf);

  // A asserção central. Todo efeito privilegiado destas funções é assíncrono;
  // se a primeira coisa aguardada é a autorização, nada privilegiado a
  // precede — nem direto, nem por helper. Um `await loadPolicies(supabase)`
  // acima do guard aparece aqui, coisa que comparar posição de `.from(` não
  // via, porque o `.from(` fica na função declarada lá embaixo.
  it("autoriza antes de qualquer coisa aguardada", () => {
    const espera = primeiro(corpo, ts.isAwaitExpression);
    expect(espera, "nenhum await no handler").toBeDefined();
    expect(nomeDaChamada(espera!.expression, sf)).toBe("requireInternalAuth");
  });

  it("encaminha a negação imediatamente depois de autorizar", () => {
    // `const auth = await requireInternalAuth(...)` e, na sequência do MESMO
    // bloco, o guard. Exigir adjacência fecha a brecha de enfiar trabalho
    // entre a decisão e o uso dela.
    const decl = primeiro(corpo, (n): n is ts.VariableStatement =>
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.some(
        (d) =>
          d.initializer !== undefined &&
          ts.isAwaitExpression(d.initializer) &&
          nomeDaChamada(d.initializer.expression, sf) === "requireInternalAuth",
      ),
    );
    expect(decl, "`await requireInternalAuth` não é atribuído").toBeDefined();

    const bloco = decl!.parent as ts.Block;
    const irmaos = bloco.statements;
    const seguinte = irmaos[irmaos.indexOf(decl!) + 1];
    expect(seguinte, "nada depois da autorização").toBeDefined();
    expect(ts.isIfStatement(seguinte)).toBe(true);

    const guarda = seguinte as ts.IfStatement;
    expect(guarda.expression.getText(sf)).toMatch(
      /^auth\s+instanceof\s+Response$/,
    );

    // O ramo verdadeiro tem que DEVOLVER a negação. `console.warn(...)` sem
    // return deixaria a requisição seguir; foi o cenário levantado na auditoria.
    const entao = ts.isBlock(guarda.thenStatement)
      ? guarda.thenStatement.statements[0]
      : guarda.thenStatement;
    expect(ts.isReturnStatement(entao)).toBe(true);
    expect((entao as ts.ReturnStatement).expression?.getText(sf)).toBe("auth");
  });

  it("passa exatamente o perfil da função", () => {
    const perfil = PERFIS[fn];
    const chamada = primeiro(corpo, (n): n is ts.CallExpression =>
      ts.isCallExpression(n) &&
      n.expression.getText(sf) === "requireInternalAuth",
    );
    expect(chamada).toBeDefined();

    const opcoes = chamada!.arguments[0];
    expect(
      opcoes && ts.isObjectLiteralExpression(opcoes),
      "opções precisam ser literal — indireção não é verificável aqui",
    ).toBe(true);

    // Spread e nome computado escondem o que está sendo passado — é o drible
    // apontado na auditoria (`...opts` injetando `allowAdminUser`). Barrados
    // aqui em vez de passarem despercebidos. Shorthand (`req,`) é aceito na
    // coleta, mas não satisfaz as exigências de literal logo abaixo.
    const props = new Map<string, ts.Expression | null>();
    for (const p of (opcoes as ts.ObjectLiteralExpression).properties) {
      expect(
        ts.isSpreadAssignment(p),
        `spread nas opções de ${fn} esconde o perfil: ${p.getText(sf)}`,
      ).toBe(false);
      expect(
        p.name !== undefined && !ts.isComputedPropertyName(p.name),
        `nome computado nas opções de ${fn}: ${p.getText(sf)}`,
      ).toBe(true);

      const chave = p.name!.getText(sf).replace(/["']/g, "");
      props.set(
        chave,
        ts.isPropertyAssignment(p) ? p.initializer : null,
      );
    }

    const flag = (nome: string) => {
      if (!props.has(nome)) return false;
      const v = props.get(nome);
      expect(
        v !== null &&
          (v.kind === ts.SyntaxKind.TrueKeyword ||
            v.kind === ts.SyntaxKind.FalseKeyword),
        `${nome} precisa ser literal true/false, é \`${v?.getText(sf) ?? "shorthand"}\``,
      ).toBe(true);
      return v!.kind === ts.SyntaxKind.TrueKeyword;
    };

    expect(flag("allowCronSecret"), "allowCronSecret").toBe(perfil.cron);
    expect(flag("allowAdminUser"), "allowAdminUser").toBe(perfil.admin);

    const negacao = (nome: "missing" | "insufficient") => {
      const v = props.get(nome);
      expect(
        v != null && ts.isObjectLiteralExpression(v),
        `${nome} precisa ser objeto literal`,
      ).toBe(true);
      const campos = new Map<string, string>();
      for (const p of (v as ts.ObjectLiteralExpression).properties) {
        const pa = p as ts.PropertyAssignment;
        campos.set(pa.name.getText(sf), pa.initializer.getText(sf));
      }
      return {
        status: Number(campos.get("status")),
        message: JSON.parse(campos.get("message") ?? '""') as string,
      };
    };

    expect(negacao("missing")).toEqual(perfil.missing);
    expect(negacao("insufficient")).toEqual(perfil.insufficient);
  });

  it("não refaz nenhuma etapa da decisão", () => {
    // Identificadores e strings vêm da árvore: comentário não conta, e string
    // não é confundida com código. Era exatamente o que a versão textual
    // errava nos dois sentidos.
    const identificadores = new Set(
      todos(sf, ts.isIdentifier).map((n) => (n as ts.Identifier).text),
    );
    for (const proibido of [
      "isServiceRoleKey",
      "isServiceRoleJwt",
      "hasValidAttendanceCronSecret",
      "atob",
    ]) {
      expect(identificadores.has(proibido), `usa ${proibido}`).toBe(false);
    }

    const literais = new Set(
      todos(sf, ts.isStringLiteral).map((n) => (n as ts.StringLiteral).text),
    );
    for (const proibido of ["service_role", "user_roles", "SUPABASE_ANON_KEY"]) {
      expect(literais.has(proibido), `menciona ${proibido}`).toBe(false);
    }
  });

  it("consome o contexto autorizado, o que faz o compilador exigir o guard", () => {
    // Ler `auth.via` depois do guard é o que transforma "apagaram o return"
    // em erro de compilação (TS2339), pego pelo `deno check` da CI. Sem
    // consumo, `auth` fica inutilizado e o TS não tem do que reclamar.
    const acessos = todos(
      corpo,
      (n) =>
        ts.isPropertyAccessExpression(n) &&
        n.expression.getText(sf) === "auth" &&
        n.name.text === "via",
    );
    expect(acessos.length, "handler não lê auth.via").toBeGreaterThan(0);
  });
});

describe("detect-attendance-risk — trava do modo", () => {
  const sf = parse("detect-attendance-risk");
  const code = sf.getFullText();

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
  const sf = parse("escalate-attendance-alerts");
  const code = sf.getFullText();

  it("carrega a policy de modo do agente", () => {
    expect(code).toContain("attendance_agent.mode");
  });

  it("decide o destino pelo modo efetivo, não pelo modo da linha", () => {
    expect(code).toContain("resolveEffectiveMode");
    expect(code).not.toMatch(/a\.mode\s*===\s*["']shadow["']/);
  });
});
