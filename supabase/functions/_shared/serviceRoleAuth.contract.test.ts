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
//   1. Há exatamente UM `Deno.serve`, top-level, e ele importa
//      `requireInternalAuth` de `../_shared/internalAuth.ts` — sem isso o
//      contrato poderia auditar um handler-chamariz e ignorar o que roda.
//   2. Antes de autorizar não se chama nada além de `Deno.env.get` e
//      `createClient` (nenhum dos dois faz I/O). Lista fechada de propósito:
//      exigir apenas "o primeiro await é a autorização" deixaria passar um
//      `fetch()` sem await ou um helper síncrono.
//   3. `const auth = await requireInternalAuth(...)` é declaração única, e o
//      statement IMEDIATAMENTE seguinte é o guard, cujo ramo verdadeiro
//      DEVOLVE a negação.
//   4. As opções são as do perfil da função, lidas do nó e pelo nome
//      semântico da propriedade — `allowAdminUser` não escapa. Spread e
//      nome computado são rejeitados em vez de passar batido.
//   5. Nenhuma peça conhecida da decisão foi refeita no handler.
//
// O QUE ISTO NÃO PROVA — e não adianta fingir que prova:
//
//   - É análise ESTÁTICA. Prova a forma do handler, não o comportamento em
//     produção. O comportamento do helper está em `internalAuth.test.ts`;
//     nenhum dos dois cobre o handler de ponta a ponta, o que exigiria quebrar
//     o import de valor de esm.sh no topo.
//   - O item 5 é BLACKLIST: proíbe os identificadores e literais conhecidos.
//     `globalThis["atob"]`, `"service" + "_role"`, outra lib de base64 ou uma
//     regra nova inventada do zero passam. A proteção real contra reimplementar
//     a decisão é ela morar num módulo testado — código novo de autorização no
//     handler é uma adição visível em review, não algo que este arquivo pegue.
//   - Não há resolução de símbolos (é um `SourceFile` solto, não um `Program`).
//     `Response` é comparado por texto e poderia, em tese, estar sombreado.
//   - Nada aqui resiste a um autor hostil. O alvo é regressão acidental de
//     quem edita o handler meses depois — não fraude deliberada, que o review
//     humano é que pega.

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

/**
 * Corpo do callback do `Deno.serve` — exigindo que ele seja ÚNICO e
 * top-level.
 *
 * Sem essas duas exigências o contrato audita o primeiro `Deno.serve` que
 * encontrar: bastaria um handler exemplar dentro de função morta, declarado
 * acima, para o teste aprovar o chamariz e ignorar o endpoint que roda.
 */
function corpoDoServe(sf: ts.SourceFile): ts.Node {
  const todosServe = todos(
    sf,
    (n) => ts.isCallExpression(n) && n.expression.getText(sf) === "Deno.serve",
  );
  if (todosServe.length !== 1) {
    throw new Error(`esperado 1 Deno.serve, achado ${todosServe.length}`);
  }
  const topLevel = sf.statements.some(
    (s) =>
      ts.isExpressionStatement(s) &&
      ts.isCallExpression(s.expression) &&
      s.expression.expression.getText(sf) === "Deno.serve",
  );
  if (!topLevel) throw new Error("Deno.serve não é chamada top-level");

  const cb = (todosServe[0] as ts.CallExpression).arguments[0];
  if (!cb || (!ts.isArrowFunction(cb) && !ts.isFunctionExpression(cb))) {
    throw new Error("callback de Deno.serve não é função");
  }
  if (!cb.body) throw new Error("callback sem corpo");
  return cb.body;
}

function nomeDaChamada(expr: ts.Expression, sf: ts.SourceFile): string {
  return ts.isCallExpression(expr) ? expr.expression.getText(sf) : "";
}

/**
 * Nome SEMÂNTICO da propriedade.
 *
 * `getText()` devolve o texto cru, então `allowAdminUser` — que o
 * runtime e o TypeScript leem como `allowAdminUser` — apareceria como outra
 * chave e a flag passaria despercebida. `.text` já vem com o escape resolvido.
 */
function nomeDaPropriedade(nome: ts.PropertyName): string | null {
  if (ts.isIdentifier(nome) || ts.isStringLiteral(nome)) return nome.text;
  if (ts.isNumericLiteral(nome)) return nome.text;
  return null;
}

// ─────────────────────── Asserções ───────────────────────

describe.each(FUNCOES_COM_SERVICE_ROLE)("%s", (fn) => {
  const sf = parse(fn);
  const corpo = corpoDoServe(sf);

  it("importa o helper aprovado", () => {
    const imports = sf.statements.filter(ts.isImportDeclaration);
    const doHelper = imports.find(
      (i) =>
        ts.isStringLiteral(i.moduleSpecifier) &&
        i.moduleSpecifier.text === "../_shared/internalAuth.ts",
    );
    expect(doHelper, "não importa ../_shared/internalAuth.ts").toBeDefined();

    const nomes = doHelper!.importClause?.namedBindings;
    expect(nomes && ts.isNamedImports(nomes)).toBe(true);
    expect(
      (nomes as ts.NamedImports).elements.map((e) => e.name.text),
    ).toContain("requireInternalAuth");
  });

  it("autoriza antes de qualquer coisa aguardada", () => {
    const espera = primeiro(corpo, ts.isAwaitExpression);
    expect(espera, "nenhum await no handler").toBeDefined();
    expect(nomeDaChamada(espera!.expression, sf)).toBe("requireInternalAuth");
  });

  // O `await` sozinho não basta: `fetch(...)` sem await, um helper síncrono ou
  // um efeito avaliado nos argumentos da própria autorização rodariam antes
  // sem criar outro `AwaitExpression`. Por isso a lista do que pode preceder é
  // fechada. `Deno.env.get` lê variável de ambiente e `createClient` só monta
  // o objeto — nenhum dos dois faz I/O. Qualquer chamada nova antes da
  // autorização quebra aqui e obriga quem escreveu a justificar.
  it("não chama mais nada antes de autorizar", () => {
    const PERMITIDAS = new Set(["Deno.env.get", "createClient"]);

    const auth = primeiro(corpo, (n): n is ts.CallExpression =>
      ts.isCallExpression(n) &&
      n.expression.getText(sf) === "requireInternalAuth",
    );
    expect(auth, "requireInternalAuth não é chamado").toBeDefined();

    const antes = todos(
      corpo,
      (n) => ts.isCallExpression(n) && n.getStart(sf) < auth!.getStart(sf),
    ).map((n) => (n as ts.CallExpression).expression.getText(sf));

    for (const chamada of antes) {
      expect(
        PERMITIDAS.has(chamada),
        `\`${chamada}()\` roda antes da autorização`,
      ).toBe(true);
    }
  });

  it("encaminha a negação imediatamente depois de autorizar", () => {
    // `const auth = await requireInternalAuth(...)` e, na sequência do MESMO
    // bloco, o guard. Exigir adjacência fecha a brecha de enfiar trabalho
    // entre a decisão e o uso dela.
    // Um único declarador, chamado `auth`, inicializado com a autorização.
    // Sem isso passaria `const ignorado = await requireInternalAuth(...),
    // auth = { via: "admin_user" };` — o guard testaria um objeto forjado.
    const decl = primeiro(corpo, (n): n is ts.VariableStatement =>
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.length === 1 &&
      ts.isIdentifier(n.declarationList.declarations[0].name) &&
      n.declarationList.declarations[0].name.text === "auth" &&
      n.declarationList.declarations[0].initializer !== undefined &&
      ts.isAwaitExpression(n.declarationList.declarations[0].initializer!) &&
      nomeDaChamada(
        (n.declarationList.declarations[0].initializer as ts.AwaitExpression)
          .expression,
        sf,
      ) === "requireInternalAuth",
    );
    expect(
      decl,
      "`const auth = await requireInternalAuth(...)` não encontrado como declaração única",
    ).toBeDefined();

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

      const chave = nomeDaPropriedade(p.name!);
      expect(chave, `nome de propriedade ilegível: ${p.getText(sf)}`).not.toBe(
        null,
      );
      props.set(
        chave!,
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
        expect(
          ts.isPropertyAssignment(p),
          `${nome} precisa ser só pares literais: ${p.getText(sf)}`,
        ).toBe(true);
        const pa = p as ts.PropertyAssignment;
        campos.set(nomeDaPropriedade(pa.name) ?? "", pa.initializer.getText(sf));
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
