// Autorizacao e validacao de entrada das edge functions bancarias.
//
// Antes deste helper, `parse-bank-statement` e `match-bank-transactions`
// checavam apenas "existe algum usuario autenticado?" e seguiam com
// `service_role`. Como o app tem login de aluno e instrutor, um JWT de aluno
// — obtido legitimamente pelo proprio app — passava nas duas: dava para
// conciliar todo o financeiro e marcar faturas/despesas como pagas, ou
// importar um extrato forjado criando despesas ja quitadas.
//
// As duas telas que chamam essas funcoes ja sao restritas a `admin`/`manager`
// (src/App.tsx), e as policies de `bank_imports`/`bank_transactions` usam as
// mesmas roles. Este helper leva essa mesma regra para o servidor, que e onde
// ela vale: `ProtectedRoute` e client-side e nao protege edge function.
//
// `createClient` entra por injecao para o modulo ficar sem import de VALOR do
// SDK e assim rodar no vitest (que coleta testes em `_shared/**`).

import {
  requireStaffRole,
  type AuthorizedContext,
  type RequireStaffRoleDependencies,
  type StaffRole,
} from "../requireStaffRole.ts";

/** Espelha as policies de bank_* e a rota /bank-reconciliation. */
export const ALLOWED_BANK_ROLES: ReadonlyArray<StaffRole> = ["admin", "manager"];

export type BankDependencies = RequireStaffRoleDependencies;

/**
 * Exige staff `admin`/`manager` autenticado com JWT de usuario.
 * Retorna o contexto autorizado ou a Response de erro pronta (401/403/500).
 *
 * `allowServiceRole: false` de proposito: nenhum cron ou edge function chama
 * essas duas — os unicos chamadores sao a tela /bank-reconciliation. Sem caso
 * de uso interno, aceitar o bearer de service_role so ampliaria a superficie,
 * e ainda gravaria `matched_by`/`imported_by` nulos, apagando de quem foi a
 * conciliacao. Mesma escolha ja feita em `emit-nfse`.
 */
export function requireBankStaff(
  req: Request,
  dependencies: BankDependencies,
): Promise<AuthorizedContext | Response> {
  return requireStaffRole(
    { req, allowed: ALLOWED_BANK_ROLES, allowServiceRole: false },
    dependencies,
  );
}

/**
 * Teto de tamanho do arquivo recebido, em caracteres do payload.
 *
 * O parser de XLSX decodifica base64 e monta a planilha inteira em memoria;
 * sem teto, um upload patologico derruba a funcao. Extrato mensal real fica
 * na casa de dezenas/centenas de KB, entao o limite e folgado de proposito.
 */
export const MAX_FILE_CONTENT_CHARS = 12_000_000;

/**
 * Teto do corpo inteiro, checado no `Content-Length` ANTES de `req.json()`.
 *
 * O teto por campo acima so vale depois que o JSON ja foi materializado; este
 * evita gastar memoria com o proprio parse. Folga sobre o limite de conteudo
 * para acomodar o envelope JSON e o escape de aspas.
 */
export const MAX_REQUEST_BYTES = 16_000_000;

/**
 * Rejeita corpo declarado acima do teto sem le-lo. `Content-Length` ausente
 * ou ilegivel nao bloqueia: a checagem por campo continua valendo depois.
 */
export function requestTooLarge(req: Request): boolean {
  const declared = Number(req.headers.get("content-length"));
  return Number.isFinite(declared) && declared > MAX_REQUEST_BYTES;
}

const SUPPORTED_FILE_TYPES = ["ofx", "csv", "xlsx", "xls"] as const;
export type BankFileType = (typeof SUPPORTED_FILE_TYPES)[number];

export interface BankStatementRequest {
  fileContent: string;
  fileName: string;
  fileType: BankFileType;
  forceImport: boolean;
}

export interface BankRequestError {
  error: string;
  status: number;
}

export function isBankRequestError(
  value: BankStatementRequest | MatchRequest | BankRequestError,
): value is BankRequestError {
  return (value as BankRequestError).status !== undefined;
}

/**
 * Valida e normaliza o corpo de `parse-bank-statement`.
 *
 * Existe tambem para corrigir um bug real: o corpo era desestruturado em
 * `fileContent/fileName/fileType`, mas `forceImport` era lido de uma variavel
 * `body` que nunca foi declarada. Isso lancava ReferenceError em TODA chamada
 * — a importacao bancaria respondia 500 sempre. Ler o corpo uma vez, aqui,
 * elimina a classe do problema em vez de so remendar a linha.
 *
 * `forceImport` continua vindo do cliente (a UI oferece reimportar quando
 * detecta duplicata), mas so o booleano literal `true` liga o modo — string
 * "true" ou 1 nao ligam mais.
 */
export function parseBankStatementRequest(
  raw: unknown,
): BankStatementRequest | BankRequestError {
  const body = isRecord(raw) ? raw : {};

  const fileContent = body.fileContent;
  const fileName = body.fileName;

  if (typeof fileContent !== "string" || fileContent.length === 0 ||
      typeof fileName !== "string" || fileName.length === 0) {
    return { error: "Arquivo obrigatório", status: 400 };
  }

  if (fileContent.length > MAX_FILE_CONTENT_CHARS) {
    return { error: "Arquivo excede o tamanho máximo suportado", status: 413 };
  }

  const fileType = body.fileType;
  if (typeof fileType !== "string" ||
      !(SUPPORTED_FILE_TYPES as ReadonlyArray<string>).includes(fileType)) {
    return { error: "Formato não suportado. Use OFX, CSV ou Excel.", status: 400 };
  }

  return {
    fileContent,
    fileName,
    fileType: fileType as BankFileType,
    forceImport: body.forceImport === true,
  };
}

export interface MatchRequest {
  importId: string | null;
  autoApply: boolean;
}

/**
 * Valida o corpo de `match-bank-transactions`.
 *
 * `autoApply` exige o booleano literal `true`: antes, qualquer valor truthy
 * (a string "false" inclusive) disparava a aplicacao real dos matches, que
 * marca faturas e despesas como pagas e nao tem desfazer.
 *
 * `import_id` presente porem invalido e ERRO, nao `null`. Normalizar para
 * `null` seria pior do que o comportamento antigo: `null` remove o filtro por
 * importacao, entao um id de tipo errado viraria varredura global — o oposto
 * do que quem enviou o campo pediu, e sem desfazer quando `auto_apply` estiver
 * ligado. Ausente ou explicitamente nulo continua significando "todas".
 */
export function parseMatchRequest(raw: unknown): MatchRequest | BankRequestError {
  const body = isRecord(raw) ? raw : {};
  const importId = body.import_id;
  const autoApply = body.auto_apply === true;

  if (importId === undefined || importId === null) {
    return { importId: null, autoApply };
  }

  if (typeof importId !== "string" || importId.length === 0) {
    return { error: "import_id inválido", status: 400 };
  }

  return { importId, autoApply };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
