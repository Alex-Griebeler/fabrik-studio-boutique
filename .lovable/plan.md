

# Correcoes da Auditoria Externa -- Itens Pendentes

## Escopo

Dos 2 problemas criticos e 1 problema de UX apontados, a maioria ja foi tratada na remediacao anterior. Restam 3 itens concretos a implementar:

---

## 1. Adicionar validacao de JWT em `emit-nfse`

**Arquivo**: `supabase/functions/emit-nfse/index.ts`

Atualmente a funcao usa `SERVICE_ROLE_KEY` diretamente sem validar quem esta chamando. Qualquer request com qualquer header seria processado.

**Correcao**: Adicionar o padrao de validacao de JWT (mesmo utilizado em `execute-nurturing-step` e `process-conversation-message`) antes de processar o request -- validando via `getClaims` que o chamador e um usuario autenticado.

---

## 2. Adicionar validacao de JWT em `send-whatsapp`

**Arquivo**: `supabase/functions/send-whatsapp/index.ts`

Mesma situacao: a funcao aceita qualquer chamada sem verificar autenticacao. Alguem com a URL poderia enviar mensagens WhatsApp arbitrarias.

**Correcao**: Adicionar validacao de JWT via `getClaims`. Permitir tambem chamadas internas (quando invocada por outras Edge Functions com service role key).

---

## 3. Fix de textos truncados no Kanban de Leads

**Arquivo**: `src/components/leads/LeadKanban.tsx`

O nome do lead no card nao tem protecao de overflow -- nomes longos podem quebrar o layout do card de 260px.

**Correcao**: Adicionar `truncate max-w-[180px]` no botao do nome do lead para garantir que nomes longos nao estourem o card.

---

## Itens da auditoria que JA FORAM corrigidos

| Item | Status |
|------|--------|
| CORS inconsistente | Corrigido na remediacao anterior |
| config.toml incompleto | Corrigido |
| setState durante render | Corrigido |
| Dashboard labels desincronizados | Corrigido |
| execute-nurturing-step sem auth | Corrigido |
| deleteConversation nao exposta | Corrigido |

## Secao Tecnica

### Padrao de validacao JWT para Edge Functions

```text
const authHeader = req.headers.get("Authorization");
if (!authHeader?.startsWith("Bearer ")) {
  return 401 Unauthorized;
}

const supabaseAuth = createClient(URL, ANON_KEY, {
  global: { headers: { Authorization: authHeader } }
});
const { data, error } = await supabaseAuth.auth.getClaims(token);
if (error) return 401;

// Prosseguir com SERVICE_ROLE_KEY para operacoes privilegiadas
const supabase = createClient(URL, SERVICE_ROLE_KEY);
```

### Fix Kanban truncate

```text
// No botao do nome do lead (linha 129-134):
className="text-sm font-medium ... truncate max-w-[180px]"
```

