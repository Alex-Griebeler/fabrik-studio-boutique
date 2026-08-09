# Colaboradores (Usuários & Papéis) + Menu lateral coerente

## Parte 1 — Tela de Colaboradores

Nova tela **Sistema → Colaboradores** (`/team`), acesso somente **admin**, para gerenciar quem entra no app e com qual papel — hoje isso só existe direto no banco.

O que a tela faz:
- Lista todos os usuários com conta no app: nome, e-mail, papéis atuais, data de criação e último acesso.
- Convidar colaborador: informar e-mail, nome e papel (admin, manager, recepção, instrutor, aluno) — o convite é enviado por e-mail e a pessoa define a senha no primeiro acesso.
- Editar papéis de um colaborador (pode ter mais de um, ex.: manager + instrutor).
- Remover acesso: revoga todos os papéis (a pessoa cai em "Sem acesso"). Confirmação por `AlertDialog`.
- Busca por nome/e-mail e filtro por papel (com opção "Todos").
- Salvaguardas: um admin não pode remover o próprio papel de admin, e o sistema nunca deixa a conta ficar sem nenhum admin.

Visual: mesmo padrão premium das outras telas (cards limpos, badges por papel, tooltips contextuais sem ícone "i").

## Parte 2 — Ajustes de coerência no menu lateral

Incoerências encontradas hoje (`AppSidebar.tsx` x papéis das rotas em `App.tsx`):

| Item | Problema | Ajuste |
|---|---|---|
| Marketing IA | visível para admin e recepção, mas não para manager | incluir `manager` (menu e rota) |
| Minha Folha | aparece para admin junto de "Folha Pagto" | restringir a `instructor` |
| Trainer App / Student App | apps mobile listados dentro de "Operacional" para admin | mover para um grupo próprio **Apps**, e no caso do instrutor/aluno o app é a home — sem duplicar |
| Instrutores | está em "Operacional" enquanto Alunos/Leads estão em "Gestão" | mover para **Gestão** (é cadastro de pessoas) |
| Analytics / Relatórios | misturados com operação diária | novo grupo **Inteligência** com Analytics e Relatórios |
| Alertas de Faltas / Risco de Evasão | ok, seguem em Operacional junto de Agenda | manter, com os badges atuais |
| Importar Alunos | em "Sistema", mas é ação de dados de alunos | manter em Sistema junto de Configurações e Colaboradores |

Estrutura final do menu:

```text
Principal     Dashboard
Gestão        Alunos · Leads · Instrutores · Tarefas · Planos
Financeiro    Financeiro · Despesas · Comissões · Folha Pagto · Minha Folha · Conciliação
Operacional   Agenda · Alertas de Faltas · Risco de Evasão · Marketing IA
Inteligência  Analytics · Relatórios
Apps          Trainer App · Student App
Sistema       Colaboradores · Importar Alunos · Configurações
```

Regra de ouro aplicada: **todo item visível no menu é uma rota que o papel realmente acessa** — os papéis do menu passam a espelhar exatamente os papéis da rota, evitando cliques que caem em "Sem acesso".

## Detalhes técnicos

- Backend: tabela `user_roles` (fonte única de papéis, sem role em profiles). Nova edge function `manage-team` (verify_jwt + `requireStaffRole`/checagem `has_role(admin)`) para: listar usuários via Admin API, convidar (`inviteUserByEmail`), atribuir/revogar papéis, com guarda "último admin" no servidor. Nada de manipulação de papéis direto do cliente.
- Frontend: `src/pages/Team.tsx` + `src/components/team/` (`TeamTable`, `InviteMemberDialog`, `EditRolesDialog`, `RoleBadge`), hook `src/hooks/useTeam.ts` (React Query, invalidação após mutações).
- Rota `/team` em `App.tsx` com `ProtectedRoute allowedRoles={["admin"]}`.
- `AppSidebar.tsx` reescrito de forma limpa: os grupos passam a ser uma estrutura declarativa única (`{ label, items }[]`), eliminando os cinco blocos repetidos de JSX; papéis derivados por item conforme a tabela acima.
- `/marketing-ai` ganha `manager` no `ProtectedRoute`.
