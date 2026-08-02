// Fake do client Supabase para os testes das funcoes financeiras.
//
// Nao e um mock "por metodo": ele grava a cadeia inteira de cada `from(...)`,
// o que permite afirmar coisas fortes — em especial que o caminho
// `validateOnly` nunca chamou insert/update/delete/upsert/rpc.
//
// Este arquivo nao casa com o glob de teste do vitest (`*.test.ts`), entao nao
// e coletado como suite; e so um fixture importado pelas suites.

export interface RecordedOperation {
  method: string;
  args: unknown[];
}

export interface RecordedQuery {
  table: string;
  ops: RecordedOperation[];
}

export interface QueryResult {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
}

/** Formato que o SDK entrega ao `await` — o que o handler desestrutura. */
export interface ResolvedQuery {
  data: unknown;
  error: { message: string } | null;
  count: number | null;
}

export type QueryResolver = (query: RecordedQuery) => QueryResult;

/** Metodos que gravam. Se algum aparecer no validateOnly, o teste falha. */
export const MUTATING_METHODS = ["insert", "update", "delete", "upsert"] as const;

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "delete",
  "upsert",
  "eq",
  "neq",
  "in",
  "not",
  "or",
  "lt",
  "lte",
  "gt",
  "gte",
  "like",
  "ilike",
  "order",
  "limit",
  "range",
  "single",
  "maybeSingle",
] as const;

export interface FakeSupabase {
  client: unknown;
  queries: RecordedQuery[];
  rpcCalls: Array<{ name: string; args: unknown[] }>;
  /** Toda operacao de escrita registrada, em qualquer tabela. */
  mutations: () => Array<{ table: string; method: string }>;
}

export function createFakeSupabase(resolve: QueryResolver): FakeSupabase {
  const queries: RecordedQuery[] = [];
  const rpcCalls: Array<{ name: string; args: unknown[] }> = [];

  const client = {
    from(table: string) {
      const query: RecordedQuery = { table, ops: [] };
      queries.push(query);

      // Sem `any`: o eslint do repo roda com `no-explicit-any` ligado também
      // em supabase/functions. O builder é um saco de métodos encadeáveis e
      // só o ponto de uso (o mock do createClient) faz o cast.
      const builder: Record<string, unknown> = {
        then(
          onFulfilled?: (value: ResolvedQuery) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          const result = resolve(query);
          return Promise.resolve({
            data: result.data ?? null,
            error: result.error ?? null,
            count: result.count ?? null,
          }).then(onFulfilled, onRejected);
        },
      };

      for (const method of CHAIN_METHODS) {
        builder[method] = (...args: unknown[]) => {
          query.ops.push({ method, args });
          return builder;
        };
      }

      return builder;
    },

    rpc(name: string, ...args: unknown[]) {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: null, error: null });
    },

    auth: {
      getClaims: (token: string) =>
        Promise.resolve({ data: { claims: { sub: `user-for-${token}` } }, error: null }),
    },
  };

  return {
    client,
    queries,
    rpcCalls,
    mutations: () =>
      queries.flatMap((query) =>
        query.ops
          .filter((op) =>
            (MUTATING_METHODS as ReadonlyArray<string>).includes(op.method)
          )
          .map((op) => ({ table: query.table, method: op.method }))
      ),
  };
}

/** Ajuda a montar Request nos testes sem repetir boilerplate de header. */
export function financeRequest(options: {
  cronSecret?: string;
  bearer?: string;
  body?: unknown;
}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.cronSecret !== undefined) headers["x-finance-cron-secret"] = options.cronSecret;
  if (options.bearer) headers["Authorization"] = `Bearer ${options.bearer}`;

  return new Request("https://example.test/function", {
    method: "POST",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}
