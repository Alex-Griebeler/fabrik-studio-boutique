# 📘 FABRIK - PARTE 3: IMPLEMENTAÇÃO

**Prompts Lovable + Código + Integrações + Roadmap**

---

# XV. PROMPTS LOVABLE (SPRINT-BY-SPRINT)

## 🎯 COMO USAR ESTE GUIA

Cada prompt está pronto para copiar e colar no Lovable. Siga a ordem para melhor resultado.

---

## 🏗️ SPRINT 1: FUNDAÇÃO (Semanas 1-2)

### **PROMPT 1.1: Setup Inicial do Projeto**

```
Crie um projeto React + TypeScript + Vite usando Lovable com as seguintes características:

STACK:
- React 18 + TypeScript
- Tailwind CSS para styling
- shadcn/ui para componentes
- React Router para navegação
- Zustand para state management
- React Hook Form + Zod para formulários
- Recharts para gráficos

ESTRUTURA DE PASTAS:
/src
  /components
    /ui (shadcn/ui components)
    /layout (Header, Sidebar, Footer)
    /forms
    /tables
    /charts
  /pages
    /dashboard
    /leads
    /students
    /sessions
    /trainers
    /financial
    /payroll
    /gamification
  /lib
    /supabase.ts
    /types.ts
    /utils.ts
  /hooks
  /stores (Zustand)

TEMA:
- Cores primárias: #FF6B35 (coral vibrante) e #004E89 (azul profundo)
- Fonte: Inter
- Dark mode suportado
- Design clean e profissional

Configure Supabase client com:
- URL: importar de .env
- Anon key: importar de .env
- Auth configurado

Crie layout base com:
- Sidebar colapsável à esquerda
- Header no topo com user menu
- Área de conteúdo central
- Navegação entre: Dashboard, Leads, Alunos, Sessões, Trainers, Financeiro, Folha, Gamificação
```

---

### **PROMPT 1.2: Database Schema Completo**

```
No Supabase SQL Editor, execute o seguinte schema completo:

[COPIAR TODO O SQL DO ARQUIVO PARTE 1, SEÇÃO IV]

Este schema inclui:
✓ 23 tabelas principais
✓ 4 views (executive_dashboard, conversion_report, student_leaderboard, payroll_pending)
✓ Triggers automáticos (QR code, points, tier calculation, invoice number)
✓ RLS policies básicas
✓ Índices de performance
✓ Constraints e foreign keys
```

---

### **PROMPT 1.3: Tipos TypeScript Gerados**

```
Gere tipos TypeScript completos para todas as tabelas do database usando o Supabase CLI:

npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/database.types.ts

Em seguida, crie tipos auxiliares em src/lib/types.ts:

export type Lead = Database['public']['Tables']['leads']['Row']
export type LeadInsert = Database['public']['Tables']['leads']['Insert']
export type LeadUpdate = Database['public']['Tables']['leads']['Update']

export type Student = Database['public']['Tables']['students']['Row']
export type StudentInsert = Database['public']['Tables']['students']['Insert']
export type StudentUpdate = Database['public']['Tables']['students']['Update']

export type Session = Database['public']['Tables']['sessions']['Row']
export type SessionInsert = Database['public']['Tables']['sessions']['Insert']
export type SessionUpdate = Database['public']['Tables']['sessions']['Update']

[... continuar para todas as 23 tabelas]

// Tipos compostos para views
export type ExecutiveDashboard = Database['public']['Views']['v_executive_dashboard']['Row']
export type ConversionReport = Database['public']['Views']['v_conversion_report']['Row']
export type StudentLeaderboard = Database['public']['Views']['v_student_leaderboard']['Row']
export type PayrollPending = Database['public']['Views']['v_payroll_pending']['Row']

// Tipos auxiliares
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'trial_scheduled' | 'trial_completed' | 'converted' | 'lost'
export type SessionType = 'group_regular' | 'personal_regular' | 'trial_group' | 'trial_personal'
export type SessionStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
export type PaymentMethod = 'hourly' | 'per_session' | 'monthly_salary'
```

---

### **PROMPT 1.4: Dashboard Executivo**

```
Crie a página de Dashboard Executivo (/dashboard) com cards KPI e gráficos:

LAYOUT:
- Grid responsivo 4 colunas (lg) / 2 colunas (md) / 1 coluna (sm)
- Cards de KPI no topo
- Gráficos abaixo

CARDS KPI (buscar de v_executive_dashboard):
1. Alunos Ativos: número + ícone Users
2. Novos Este Mês: número + % variação + ícone TrendingUp
3. Receita Mensal: R$ formatado + ícone DollarSign
4. Inadimplência: R$ + alerta se > R$5k + ícone AlertCircle
5. Sessões Hoje: número + ícone Calendar
6. Experimentais Hoje: número/4 (quota) + ícone UserPlus
7. Leads Qualificados: número + ícone Target
8. Capacidade: % ocupação + progress bar + ícone TrendingUp

GRÁFICOS (usando Recharts):
1. Conversão por Canal (BarChart)
   - Dados de v_conversion_report agrupado por source
   - X: canal (Instagram, TikTok, Facebook, WhatsApp)
   - Y: taxa de conversão %

2. Receita vs Meta (LineChart)
   - X: últimos 12 meses
   - Y: R$ receita
   - 2 linhas: Real vs Meta (R$110k)

3. Distribuição Group vs Personal (PieChart)
   - Groups: 79%
   - Personal: 21%

4. Ocupação por Horário (BarChart)
   - X: horários (07:00, 09:00, 18:00, 19:00)
   - Y: % ocupação

Use shadcn/ui Card component para estrutura.
Atualize dados a cada 30s usando Supabase Realtime.
```

---

### **PROMPT 1.5: CRUD de Leads**

```
Crie a página de gestão de Leads (/leads) com:

FEATURES:
1. Lista de leads em tabela (shadcn/ui DataTable)
2. Filtros por: status, source, qualification_score, data de criação
3. Search bar (nome, email, phone)
4. Ações por linha: Ver detalhes, Editar, Converter em aluno, Marcar como perdido
5. Botão "Novo Lead" abre modal
6. Kanban view (opcional, toggle)

COLUNAS DA TABELA:
- Nome (com avatar inicial)
- Email
- Telefone (formatado BR)
- Source (badge colorido)
- Score (0-100 com cor: A=green, B=blue, C=yellow, D=gray)
- Status (badge)
- Última interação (relative time: "há 2 horas")
- Ações (dropdown menu)

MODAL NOVO LEAD:
- Form com React Hook Form + Zod validation
- Campos: nome*, email*, telefone*, source*, tags, qualification_details (JSON)
- Ao criar, calcular qualification_score automaticamente via Edge Function
- Toast de sucesso

KANBAN VIEW:
- 5 colunas: New, Contacted, Qualified, Trial Scheduled, Converted
- Drag & drop para mudar status (usar @dnd-kit)
- Counter de leads por coluna
- Cards compactos com: nome, score, source, tempo no stage

DETALHES DO LEAD (modal ou página):
- Timeline de interações
- Qualification details expandido
- Histórico de conversas (se houver)
- Botão "Agendar Experimental"
- Botão "Converter em Aluno"
```

---

### **PROMPT 1.6: CRUD de Alunos**

```
Crie a página de gestão de Alunos (/students) com:

LISTA:
- DataTable com filtros: status, plano, trainer principal, tier gamificação
- Search: nome, email, CPF
- Colunas:
  * Nome + foto
  * Email
  * Telefone
  * Status (active/suspended/cancelled)
  * Plano atual (mensal/trimestral/semestral/anual)
  * Tier gamificação (badge colorido)
  * Próxima sessão
  * Inadimplência (alerta se overdue)
  * Ações

AÇÕES:
- Ver perfil completo
- Editar dados
- Ver faturas
- Ver histórico de sessões
- Suspender/Reativar
- Cancelar matrícula

MODAL ADICIONAR ALUNO:
- Opção 1: Converter de lead (autocomplete)
- Opção 2: Cadastro direto
- Form: dados pessoais, contato, emergência, wearables, plano inicial

PERFIL DO ALUNO (página dedicada /students/:id):
TABS:
1. Visão Geral:
   - Card com foto, nome, status
   - Próximas sessões (lista)
   - Resumo financeiro (faturas pendentes)
   - Resumo gamificação (pontos, tier, próximo tier)

2. Sessões:
   - Histórico completo com filtros
   - Status: completadas, canceladas, no-shows
   - Taxa de presença
   - Makeup credits disponíveis

3. Financeiro:
   - Contrato atual (detalhes)
   - Faturas (lista com status)
   - Histórico de pagamentos
   - Gráfico de receita gerada (lifetime value)

4. Gamificação:
   - Pontos detalhados (histórico de ganhos)
   - Progresso no tier
   - Recompensas resgatadas
   - Recompensas disponíveis

5. Dados Pessoais:
   - Informações completas
   - Contato de emergência
   - Wearables conectados
   - Editar (form)
```

---

## 💰 SPRINT 2: FINANCEIRO (Semanas 3-4)

### **PROMPT 2.1: Contratos e Faturas**

```
Crie o módulo Financeiro (/financial) com abas:

ABA 1: CONTRATOS
- Lista de contratos ativos, expirados, cancelados
- Filtros: aluno, tipo de plano, status, data
- Colunas:
  * Aluno
  * Tipo de plano (mensal/trimestral/semestral/anual)
  * Modalidade (group/personal/hybrid)
  * Valor mensal (R$)
  * Data início
  * Data fim
  * Auto-renovação (toggle)
  * Status
  * Ações (ver, editar, cancelar)

NOVO CONTRATO (modal):
- Selecionar aluno (autocomplete)
- Tipo de plano (radio buttons com preços)
- Modalidade (radio: group/personal/hybrid)
- Frequência semanal (2x, 3x, 4x)
- Data início (date picker)
- Auto-renovação (checkbox, default true)
- Calcular valor automaticamente
- Gerar primeira fatura ao criar

ABA 2: FATURAS
- Lista de todas as faturas
- Filtros: status (pending/paid/overdue), mês, aluno
- Colunas:
  * Número fatura (FAT-YYYYMM-####)
  * Aluno
  * Valor
  * Vencimento
  * Status (badge colorido)
  * NF-e (ícone check se emitida)
  * Ações (ver, baixar NF-e, marcar como paga, enviar lembrete)

DETALHES DA FATURA (modal):
- Informações completas
- Contrato relacionado
- Histórico de tentativas de pagamento
- Botão "Marcar como Paga" (abre modal para confirmar)
- Botão "Enviar NF-e por Email"
- Botão "Baixar PDF da NF-e"

ABA 3: TRANSAÇÕES
- Lista de todas as transações de entrada
- Filtros: tipo (dcc/pix/transfer), data, reconciliado
- Colunas:
  * Data
  * Descrição
  * Valor
  * Tipo
  * External ID (se tiver)
  * Reconciliado (ícone check)
  * Fatura vinculada
  * Ações (ver, reconciliar manualmente)

BOTÃO "IMPORTAR OFX":
- Upload de arquivo .ofx
- Preview das transações encontradas
- Match automático com transações existentes
- Lista de matches sugeridos (score 0-100)
- Aceitar/Rejeitar cada match
- Confirmar importação
```

---

### **PROMPT 2.2: Reconciliação Automática**

```
Crie a página de Reconciliação (/financial/reconciliation) com:

LAYOUT EM 3 PAINÉIS:

PAINEL ESQUERDO: Transações Não Reconciliadas
- Lista de transactions onde reconciled = false
- Ordenar por data (mais recente primeiro)
- Highlight se tiver match sugerido
- Selecionar para match manual

PAINEL CENTRAL: Área de Match
- Mostrar detalhes da transação selecionada
- Buscar matches potenciais em bank_statements
- Algoritmo:
  * Exact match: amount ± R$0.00, date ±2 dias
  * Fuzzy match: amount ± R$0.50, date ±5 dias, description similarity >80%
  * Manual: selecionar qualquer statement

- Listar matches sugeridos com score
- Cada sugestão mostra:
  * Score (0-100) com cor
  * Bank statement details
  * Diferenças (amount diff, date diff)
  * Botão "Aceitar Match"

PAINEL DIREITO: Statements Não Reconciliados
- Lista de bank_statements onde reconciled = false
- Filtros por data, amount range
- Selecionar para match manual

AÇÕES:
- "Match Automático em Lote" (pega todos exact matches)
- "Criar Transação Nova" (se statement não tem par)
- "Marcar como Conciliado" (manual)
- "Rejeitar Match Sugerido"

ESTATÍSTICAS NO TOPO:
- Total transações não reconciliadas: X (R$ Y)
- Total statements não reconciliados: X (R$ Y)
- Matches sugeridos: X (score médio: Y)
- Taxa de reconciliação: X%
```

---

### **PROMPT 2.3: Integração Focusnfe (NF-e)**

```
Crie Edge Function para emissão automática de NF-e:

TRIGGER: Quando invoice.status muda para 'paid'

FUNÇÃO: emit-nfe
- Buscar dados do student e invoice
- Validar CPF/CNPJ
- Montar payload Focusnfe:
{
  "natureza_operacao": "Prestação de serviços",
  "data_emissao": "2026-02-10T10:00:00-03:00",
  "tipo_documento": "1",
  "local_destino": "1",
  "presenca_comprador": "4",
  "items": [{
    "numero_item": "1",
    "codigo_produto": "SERVICO-FABRIK",
    "descricao": "Serviço de treinamento personalizado",
    "cfop": "5933",
    "unidade_comercial": "UN",
    "quantidade_comercial": "1",
    "valor_unitario_comercial": invoice.amount,
    "valor_bruto": invoice.amount,
    "tributacao": "Isento"
  }],
  "cliente": {
    "cpf_cnpj": student.cpf_cnpj,
    "nome": student.full_name,
    "email": student.email,
    "telefone": student.phone,
    "endereco": student.address,
    "numero": student.address_number,
    "bairro": student.neighborhood,
    "municipio": student.city,
    "uf": student.state,
    "cep": student.zip_code
  }
}

- POST para https://api.focusnfe.com.br/v2/nfse
- Headers: Authorization: Basic {FOCUSNFE_TOKEN}
- Salvar focusnfe_ref em nfe_requests
- Polling: a cada 30s por até 10x verificar status
- Quando issued: salvar nfe_number, nfe_key, nfe_xml_url, nfe_pdf_url
- Atualizar invoice com dados da NF-e
- Enviar email para aluno com PDF anexado

PÁGINA UI: NF-e Status (/financial/nfe)
- Lista de todas as nfe_requests
- Filtros: status, mês
- Colunas:
  * Invoice #
  * Aluno
  * Valor
  * Status (badge: pending/processing/issued/failed)
  * NF-e número
  * Data emissão
  * Tentativas
  * Ações (ver XML, baixar PDF, reenviar)

- Botão "Reprocessar Falhas" (retry failed requests)
```

---

## 🏋️ SPRINT 3: OPERAÇÕES (Semanas 5-6)

### **PROMPT 3.1: Gestão de Turmas (Classes)**

```
Crie a página de Classes (/classes) para gerenciar turmas fixas:

VISUALIZAÇÃO:
- Grid semanal (7 colunas = dias da semana)
- Cada dia mostra turmas naquele dia (ordenadas por horário)
- Card de turma mostra:
  * Horário (start - end)
  * Trainer (com avatar)
  * Modalidade
  * Ocupação atual (X/8 ou X/15)
  * Status (active/cancelled)
  * Botão "Ver Detalhes"

FILTROS:
- Por trainer
- Por modalidade
- Por horário
- Apenas com vagas

NOVA TURMA (modal):
- Dia da semana (checkbox: seg, ter, qua, qui, sex, sab)
- Horário início (time picker)
- Duração (30 ou 60 min)
- Trainer (select)
- Modalidade (select: Back to Basics, HIIT, Flow, Yoga)
- Capacidade máxima (number, default 8)
- Recorrência (checkbox: criar todas as semanas por X meses)

DETALHES DA TURMA (modal ou página):
- Informações completas
- Lista de alunos matriculados
- Histórico de sessões desta turma
- Taxa média de ocupação
- Botão "Adicionar Aluno"
- Botão "Cancelar Turma" (cancela apenas uma data ou todas as futuras)
- Botão "Alterar Horário/Trainer" (apenas futuras)
```

---

### **PROMPT 3.2: Gestão de Sessões**

```
Crie a página de Sessões (/sessions) com visualização em agenda:

VIEWS:
1. Calendário Mensal (react-big-calendar)
   - Cada sessão como evento colorido:
     * Verde: completed
     * Azul: scheduled
     * Amarelo: in_progress
     * Vermelho: cancelled
     * Cinza: no_show
   - Clicar abre detalhes

2. Lista por Dia (default hoje)
   - Agrupado por horário
   - Card de sessão mostra:
     * Horário
     * Tipo (group/personal/trial)
     * Aluno(s)
     * Trainer
     * Status
     * Check-in status (ícones: trainer ✓, student ✓)
     * Ações (ver QR, marcar presença manualmente, cancelar)

FILTROS:
- Data (date range picker)
- Tipo de sessão
- Status
- Trainer
- Aluno

NOVA SESSÃO AVULSA (modal):
- Tipo (group/personal)
- Aluno (autocomplete, multi-select se group)
- Trainer (select)
- Data e horário (datetime picker)
- Duração (30 ou 60 min)
- Classe (se group, select de classes existentes) OU criar horário avulso
- Observações

DETALHES DA SESSÃO (modal):
- Informações completas
- QR Code (grande, scannable)
- Status dos check-ins:
  * Trainer: checked at X, location (mapa mini)
  * Student: checked at X, location (mapa mini)
- Se late_arrival: mostrar em destaque com minutos de atraso
- Se location_mismatch: alerta
- Histórico de alterações
- Botões: "Cancelar Sessão", "Marcar Presença Manual", "Gerar Novo QR"
```

---

### **PROMPT 3.3: Check-in App (PWA para Trainers)**

```
Crie uma versão mobile-first para trainers (/trainer-app):

TELA 1: MINHAS SESSÕES HOJE
- Lista de sessões do trainer logado para hoje
- Ordenadas por horário
- Card de sessão:
  * Horário
  * Tipo
  * Aluno(s) (lista se group)
  * Local (classe ou personal)
  * Status check-in (pendente/completo)
  * Botão "Check-in" (grande, destaque)

TELA 2: FAZER CHECK-IN
- Solicitar permissão de localização
- Validar que está no studio (geofence)
- Mostrar QR Code scanner (react-qr-reader)
- OU botão "Check-in Manual" (lista de sessões)
- Após scan/seleção:
  * Confirmar sessão
  * Registrar check-in do trainer
  * Mostrar QR Code da sessão para alunos escanearem
  * Counter: X/Y alunos já fizeram check-in

TELA 3: SESSÃO EM ANDAMENTO
- Timer mostrando tempo decorrido
- Lista de alunos com status check-in
- Botão "Finalizar Sessão" (marca como completed)
- Botão "Registrar No-Show" (para cada aluno que faltou)

PWA CONFIG:
- Installable (manifest.json)
- Offline-first (service worker)
- Push notifications (avisos de sessão próxima)
```

---

### **PROMPT 3.4: Check-in App (PWA para Alunos)**

```
Crie versão mobile para alunos (/student-app):

NAVEGAÇÃO BOTTOM:
- Home (sessões)
- Pontos (gamificação)
- Perfil

TELA HOME:
- Próxima sessão (card grande com countdown)
- QR Code da próxima sessão (se dentro da janela de 30min)
- Botão "Fazer Check-in" (abre scanner)
- Lista "Minhas Próximas Sessões" (próximos 7 dias)
- Botão "Agendar Nova Sessão"

CHECK-IN FLOW:
1. Validar que sessão está no time window
2. Solicitar localização
3. Validar geofence
4. Scanner QR Code
5. Enviar check-in
6. Feedback visual (animação ✓)
7. Mostrar pontos ganhos (+10 base, +5 se early)

TELA PONTOS:
- Card com tier atual (badge grande)
- Pontos totais
- Progresso para próximo tier (progress bar)
- "Você precisa de X pontos para {next_tier}"
- Lista de últimas atividades pontuadas
- Botão "Ver Recompensas"

TELA PERFIL:
- Foto e nome
- Email e telefone
- Estatísticas:
  * Total de sessões
  * Taxa de presença
  * Pontos lifetime
  * Tier atual
- Próximo pagamento
- Botões: "Editar Dados", "Minhas Faturas", "Sair"

PWA CONFIG:
- Manifest com ícones
- Service worker
- Add to Home Screen prompt
```

---

## 💵 SPRINT 4: FOLHA DE PAGAMENTO (Semana 7)

### **PROMPT 4.1: Módulo de Folha**

```
Crie a página de Folha de Pagamento (/payroll) com:

ABA 1: CICLOS
- Lista de payroll_cycles
- Colunas:
  * Mês referência (ex: "Janeiro 2026")
  * Status (badge: draft/pending_approval/approved/paid/locked/disputed)
  * Total sessões
  * Total a pagar (R$)
  * Sessões disputadas
  * Data criação
  * Ações (ver, aprovar, pagar, exportar)

BOTÃO "GERAR NOVO CICLO":
- Modal: selecionar mês/ano
- Calcular automaticamente todas as sessões completed do mês
- Criar payroll_cycle
- Criar payroll_items para cada sessão
- Mostrar preview: X sessões, R$ Y total, distribuído entre Z trainers
- Confirmar geração

DETALHES DO CICLO (página /payroll/:id):
- Header com resumo: mês, status, totais
- Botões de ação (baseado em status):
  * Draft: "Enviar para Aprovação"
  * Pending: "Aprovar", "Rejeitar"
  * Approved: "Marcar como Pago", "Exportar CSV"
  * Paid: "Baixar Comprovante"

TABELA DE ITENS:
- Agrupado por trainer
- Colunas:
  * Data sessão
  * Horário
  * Tipo (group/personal/trial)
  * Aluno(s)
  * Duração
  * Role (main/assistant)
  * Valor calculado
  * Ajuste
  * Valor final
  * Disputado? (flag)
  * Ações

FILTROS:
- Por trainer
- Apenas disputados
- Por tipo de sessão

ABA 2: DISPUTAS
- Lista de payroll_items onde disputed = true
- Status: pending/resolved
- Colunas:
  * Ciclo (mês)
  * Trainer
  * Data sessão
  * Motivo da disputa
  * Valor original
  * Valor sugerido
  * Status
  * Ações (resolver, rejeitar)

RESOLVER DISPUTA (modal):
- Mostrar motivo do trainer
- Campo para resposta/explicação
- Ajustar valor final (se necessário)
- Botão "Resolver e Aprovar"
```

---

### **PROMPT 4.2: Trainer View - Minha Folha**

```
Crie view para trainers verem sua própria folha (/trainer/payroll):

HEADER:
- Total a receber este mês (grande, destaque)
- Status do pagamento
- Data prevista de pagamento

CARDS:
- Sessões realizadas este mês
- Horas trabalhadas
- Taxa média por hora
- Comparativo com mês anterior (+ ou -)

LISTA DE SESSÕES:
- Todas as sessões do trainer no mês atual
- Filtros: tipo, status de pagamento
- Colunas:
  * Data/hora
  * Tipo
  * Aluno(s)
  * Duração
  * Valor
  * Pago? (check)

BOTÃO "DISPUTAR ITEM":
- Modal com form:
  * Selecionar sessão
  * Motivo (textarea)
  * Valor esperado (number)
  * Evidências (upload opcional)
- Marca payroll_item.disputed = true
- Notifica gestor

HISTÓRICO:
- Abas por mês (últimos 6 meses)
- Ver folha fechada de meses anteriores
- Baixar holerite (PDF)
```

---

## 🎮 SPRINT 5: GAMIFICAÇÃO (Semanas 11-12)

### **PROMPT 5.1: Sistema de Pontos**

```
Sistema de pontos já está configurado no database via triggers.
Agora crie as interfaces:

PÁGINA ADMIN: Gamificação Overview (/gamification)

CARDS:
- Total de pontos distribuídos (all time)
- Pontos distribuídos este mês
- Alunos engajados (com pontos > 0)
- Taxa de engajamento

GRÁFICOS:
1. Pontos distribuídos por mês (LineChart, últimos 12 meses)
2. Distribuição de alunos por tier (PieChart)
3. Top 10 alunos (BarChart horizontal)

AÇÕES MANUAIS:
- Botão "Adicionar Pontos Manuais" (modal):
  * Aluno (autocomplete)
  * Quantidade (number)
  * Motivo (text)
  * Expiração (date picker, opcional)

- Botão "Ajustar Pontos" (modal):
  * Aluno
  * Operação (adicionar/remover)
  * Quantidade
  * Motivo (obrigatório para remoções)

HISTÓRICO DE PONTOS:
- Tabela com TODAS as entries de gamification_points
- Filtros: aluno, action_type, data
- Colunas:
  * Data
  * Aluno
  * Ação (badge colorido por tipo)
  * Pontos (+10, +5, etc)
  * Expira em
  * Origem (sessão #ID ou "manual")
```

---

### **PROMPT 5.2: Tiers e Benefícios**

```
Criar gestão de Tiers (/gamification/tiers):

LISTA DE TIERS (5 fixos):
- Bronze (0-499)
- Silver (500-999)
- Gold (1000-2499)
- Platinum (2500-4999)
- Diamond (5000+)

CADA TIER TEM CARD VISUAL:
- Badge grande (ícone + cor)
- Nome do tier
- Range de pontos
- Benefícios (lista):
  * Priority booking (sim/não)
  * Free guests (número)
  * Discount percentage (%)
  * Exclusive classes (sim/não)
  * Merchandise discount (%)
  * Additional benefits (JSONB, custom)
- Número de alunos nesse tier
- Botão "Editar Benefícios"

EDITAR BENEFÍCIOS (modal):
- Form com todos os campos acima
- Validação: tier superior deve ter >= benefícios que inferior
- Salvar atualiza gamification_tiers

PÁGINA PÚBLICA: Sobre os Tiers (/tiers)
- Versão bonita para alunos verem
- Sem edição
- Cards grandes com:
  * Badge animado
  * Nome
  * "De X a Y pontos"
  * Lista de benefícios com ícones
  * CTA: "Quer chegar aqui? Continue treinando!"
```

---

### **PROMPT 5.3: Catálogo de Recompensas**

```
Criar catálogo de recompensas (/gamification/rewards):

VIEW ADMIN:

LISTA DE RECOMPENSAS:
- Cards em grid
- Cada card:
  * Imagem (upload ou placeholder)
  * Nome
  * Descrição breve
  * Custo em pontos (grande, destaque)
  * Tier mínimo (badge)
  * Quantidade disponível
  * Resgates (X de Y)
  * Status (active/inactive)
  * Ações (editar, desativar)

BOTÃO "NOVA RECOMPENSA":
- Modal com form:
  * Nome
  * Descrição
  * Categoria (dropdown: merchandise/service/discount/experience/partner)
  * Custo em pontos
  * Tier mínimo
  * Quantidade disponível
  * Max resgates por aluno
  * Imagem (upload)
  * Status (active/inactive)

EDITAR RECOMPENSA:
- Mesmo form acima
- Adicionar campo "Ajustar quantidade" (+/-)

VIEW ALUNO (/rewards):
- Grid de recompensas disponíveis
- Filtros: categoria, custo (range), tier
- Ordenar por: custo, popularidade, novidade
- Cards bonitos com:
  * Imagem grande
  * Nome
  * Descrição
  * Custo (em destaque, comparar com pontos do aluno)
  * Se aluno tem pontos suficientes: botão "Resgatar"
  * Se não: "Faltam X pontos"
  * Se tier insuficiente: "Requer tier {name}"

MODAL RESGATAR:
- Confirmar: "Você tem {pontos} pontos. Esta recompensa custa {custo}."
- Após resgate: "Ficará com {resto} pontos"
- Input de observações (ex: tamanho da camiseta)
- Botão "Confirmar Resgate"
- Cria gamification_redemptions com status=pending

GESTÃO DE RESGATES (/gamification/redemptions):
- Lista de todos os redemptions
- Filtros: status, aluno, recompensa, data
- Colunas:
  * Data
  * Aluno
  * Recompensa
  * Pontos gastos
  * Status (pending/approved/delivered/cancelled)
  * Observações
  * Ações (aprovar, entregar, cancelar)

APROVAR RESGATE:
- Marca status=approved
- Decrementa remaining_quantity da recompensa
- Envia notificação para aluno

ENTREGAR:
- Marca status=delivered
- Campo para tracking/notas
```

---

### **PROMPT 5.4: Leaderboard Público**

```
Criar leaderboard (/leaderboard):

DESIGN:
- Página pública (não precisa login)
- Header grande: "RANKING FABRIK"
- Subtitle: "Nossos atletas mais dedicados"

TOP 3 (DESTAQUE):
- Cards grandes, lado a lado
- 1º lugar: ouro, maior
- 2º: prata
- 3º: bronze
- Mostrar:
  * Foto (avatar circular grande)
  * Nome
  * Pontos (número grande)
  * Tier (badge)
  * Sessões completadas
  * Taxa de presença

POSIÇÕES 4-20:
- Lista/tabela
- Colunas:
  * #Rank
  * Avatar + Nome
  * Pontos
  * Tier (badge pequeno)
  * Sessões
  * Taxa presença

FILTROS:
- Período: Este mês / Este ano / All time
- Tier específico (opcional)

BUSCAR MEU RANKING:
- Input: "Insira seu email ou telefone"
- Mostra posição do aluno + contexto (3 acima, 3 abaixo)

ATUALIZAÇÃO:
- Real-time via Supabase Realtime
- Animação suave quando posições mudam

WIDGET: "Seu Ranking" (para alunos logados)
- Card pequeno no dashboard do aluno
- Mostra: "Você está em #X com Y pontos"
- "Você precisa de Z pontos para subir 1 posição"
- Link "Ver Ranking Completo"
```

---

## 🤖 SPRINT 6: MARKETING IA (Semanas 9-10)

### **PROMPT 6.1: Conversas AI - Admin View**

```
Criar gestão de conversas (/conversations):

LISTA:
- Cards de conversas
- Filtros: status, canal, lead/aluno, data
- Ordenar: mais recentes primeiro
- Cada card:
  * Avatar do lead/aluno
  * Nome
  * Canal (badge: whatsapp/instagram/facebook)
  * Status (active/completed/abandoned/transferred)
  * Última mensagem (preview)
  * Timestamp relativo
  * Contador de mensagens
  * Score (se lead)
  * Ações (ver, assumir, encerrar)

VER CONVERSA (página /conversations/:id):

LAYOUT 3 COLUNAS:

ESQUERDA: INFO DO LEAD/ALUNO
- Avatar e nome
- Telefone, email
- Source
- Se lead:
  * Qualification score (grande)
  * Status no pipeline
  * Tags
  * Botão "Converter em Aluno"
- Se aluno:
  * Status (active/suspended)
  * Tier
  * Próximas sessões

CENTRO: CHAT
- Timeline de mensagens
- Diferencia:
  * user (bolha azul, direita)
  * assistant (bolha cinza, esquerda)
  * system (linha divisória, centralizado)
- Imagens/arquivos renderizados inline
- Timestamps relativos
- Indicador "typing..." (se AI está processando)

SE CONVERSA ATIVA:
- Botão "Assumir Conversa" (humano toma controle)
- Ao assumir:
  * Envia mensagem system: "Olá! Agora você está falando com {manager_name}"
  * Libera input para humano responder
  * AI não responde mais automaticamente

INPUT (apenas se assumida):
- Textarea
- Botões: emoji, anexar arquivo, enviar
- Shift+Enter para quebra de linha

DIREITA: CONTEXTO DA CONVERSA
- Stage atual (badge)
- Objetivo identificado
- Modalidade sugerida
- Qualification data (resumo)
- Histórico de ações automáticas
- Botão "Ver Histórico Completo"

AÇÕES NO TOPO:
- "Encerrar Conversa" (marca como completed)
- "Agendar Trial" (abre modal)
- "Converter em Aluno" (abre modal)
- "Adicionar Nota" (campo de observação, salvo no context)
```

---

### **PROMPT 6.2: Configuração do AI Agent**

```
Criar página de configuração (/settings/ai-agent):

SEÇÕES:

1. SYSTEM PROMPT:
- Textarea grande com o prompt atual
- Syntax highlight (markdown)
- Variáveis disponíveis (lista): {studio_name}, {coordinator}, etc.
- Botão "Testar Prompt" (abre modal simulando conversa)
- Botão "Salvar"
- Histórico de versões (dropdown, pode restaurar)

2. KNOWLEDGE BASE:
- Editor JSON do FABRIK_KNOWLEDGE
- Campos estruturados:
  * location
  * coordinator
  * modalities (array)
  * session_duration
  * target_age
  * etc.
- Validação ao salvar

3. COMPORTAMENTO:
- Toggles:
  * Auto-respond enabled
  * Human timing simulation
  * Qualification pre-filter
  * Auto-schedule trials (se score >= X)
- Sliders:
  * Response delay min/max (ms)
  * Max messages before handoff
  * Qualification threshold

4. HANDOFF RULES:
- Condições para transferir para humano:
  * Checkbox: "Insiste em preço"
  * Checkbox: "Pede desconto"
  * Checkbox: "Questões clínicas complexas"
  * Checkbox: "Alta intenção (quer fechar)"
  * Custom regex: campo para adicionar palavras-chave
- Message template ao transferir

5. CUSTO E USO:
- Card: Total gasto este mês (R$)
- Card: Total de mensagens processadas
- Card: Custo médio por conversa
- Gráfico: uso diário (últimos 30 dias)
- Tabela: conversas mais custosas (top 10)
```

---

### **PROMPT 6.3: Sequências de Nurturing**

```
Criar gestão de sequências (/marketing/sequences):

LISTA DE SEQUÊNCIAS:
- Cards
- Cada sequência:
  * Nome
  * Trigger
  * Número de mensagens
  * Status (active/paused)
  * Taxa de abertura / cliques
  * Conversões (se aplicável)
  * Ações (editar, pausar, duplicar, deletar)

SEQUÊNCIAS PRÉ-CONFIGURADAS:
1. "Instagram Captured"
2. "Post-Trial"
3. "Abandoned Cart" (se aplicável)
4. "Reengagement" (alunos inativos)

CRIAR/EDITAR SEQUÊNCIA (página):

HEADER:
- Nome da sequência
- Descrição
- Trigger (dropdown de eventos disponíveis)
- Status (toggle: active/paused)

VISUAL BUILDER:
- Timeline vertical
- Cada "step" é um card:
  * Número do step
  * Delay (X hours/days após anterior)
  * Canal (whatsapp/email/sms)
  * Condição (opcional): "Apenas se {condition}"
  * Template da mensagem (editor com variáveis)
  * Preview (mostra com dados de exemplo)
  * Botões: editar, deletar, adicionar após

VARIÁVEIS DISPONÍVEIS:
- {{lead.name}}
- {{lead.first_name}}
- {{trial.date}}
- {{trial.time}}
- {{trial.trainer}}
- etc.

CONDIÇÕES:
- Dropdown: "Não respondeu", "Não agendou trial", "Não converteu", etc.
- Operadores lógicos: AND, OR

ADICIONAR STEP:
- Botão "+" entre steps
- Modal:
  * Delay
  * Canal
  * Condição
  * Template (editor)

TESTAR SEQUÊNCIA:
- Botão "Testar com Lead"
- Seleciona lead de teste
- Mostra preview de todas as mensagens que seriam enviadas
- Não envia de verdade

ANALYTICS DA SEQUÊNCIA:
- Abas:
  * Overview (cards: enviados, abertos, cliques, conversões)
  * Performance por Step (qual step tem melhor taxa)
  * Leads na sequência (lista, em qual step estão)
```

---

## 📊 SPRINT 7: ANALYTICS (Final)

### **PROMPT 7.1: Analytics Dashboard**

```
Criar dashboard de analytics avançado (/analytics):

FILTROS GLOBAIS (topo):
- Date range picker (com presets: hoje, esta semana, este mês, últimos 3 meses)
- Comparar com período anterior (toggle)

SEÇÃO 1: CONVERSÃO

Cards KPI:
- Taxa de conversão geral (%)
- Leads novos vs período anterior
- Trials agendados vs realizados
- Alunos convertidos
- Tempo médio de conversão (dias)

Gráfico Funil:
- Leads capturados
- → Qualificados (% drop)
- → Trials agendados (% drop)
- → Trials realizados (% drop)
- → Convertidos (% drop)
- Cada etapa clicável para drill-down

Gráfico por Canal:
- BarChart horizontal
- Cada canal com:
  * Leads capturados
  * Qualified
  * Converted
  * Custo por lead (se integrado ads)
  * ROI

SEÇÃO 2: OPERAÇÕES

Cards KPI:
- Total de sessões (mês)
- Taxa de ocupação (%)
- No-shows (número + %)
- Cancelamentos late (número + %)
- Makeup credits emitidos

Gráfico Ocupação por Horário:
- HeatMap
- X: horários (07:00, 09:00, ...)
- Y: dias da semana
- Cor: % ocupação (0-100%)

Gráfico Distribuição:
- PieChart: Groups vs Personal
- PieChart: Modalidades (Back to Basics, HIIT, Flow, Yoga)

SEÇÃO 3: FINANCEIRO

Cards KPI:
- MRR (Monthly Recurring Revenue)
- Churn rate (%)
- Lifetime Value médio
- Inadimplência (valor + %)
- CAC (Customer Acquisition Cost)

Gráfico Receita:
- LineChart
- X: meses
- Y: R$
- 3 linhas:
  * Receita bruta
  * Receita líquida (após custos)
  * Meta

Gráfico Cohorts:
- Table/HeatMap
- X: meses desde aquisição
- Y: cohort (mês de entrada)
- Valor: retention rate (%)

SEÇÃO 4: GAMIFICAÇÃO

Cards KPI:
- Taxa de engajamento (%)
- Pontos distribuídos (mês)
- Resgates realizados
- Alunos em cada tier

Gráfico Pontos vs Retenção:
- ScatterPlot
- X: total de pontos
- Y: meses de retenção
- Cada ponto = um aluno
- Mostrar correlação

SEÇÃO 5: PREDIÇÕES (AI/ML - avançado)

Cards:
- Risco de churn (lista top 10 alunos)
- Leads com alta probabilidade de conversão
- Horários subutilizados (oportunidade)
- Forecast de ocupação (próximos 30 dias)

Gráfico Forecast:
- LineChart
- X: próximos 30 dias
- Y: % ocupação prevista
- Área sombreada: intervalo de confiança
```

---

### **PROMPT 7.2: Relatórios Customizáveis**

```
Criar builder de relatórios (/analytics/reports):

LISTA DE RELATÓRIOS SALVOS:
- Cards
- Cada relatório:
  * Nome
  * Tipo (conversão/operações/financeiro/custom)
  * Última execução
  * Botão "Ver", "Editar", "Duplicar", "Agendar", "Deletar"

CRIAR RELATÓRIO (page):

STEP 1: TIPO
- Cards grandes com ícones:
  * Conversão (funil de vendas)
  * Operações (sessões, ocupação)
  * Financeiro (receita, churn)
  * Folha de pagamento
  * Custom (escolher métricas)

STEP 2: MÉTRICAS (se Custom)
- Checkbox list de todas as métricas disponíveis:
  * Leads (novos, qualificados, convertidos, ...)
  * Sessões (total, completadas, no-shows, ...)
  * Receita (MRR, churn, LTV, ...)
  * Gamificação (pontos, resgates, ...)
- Multi-select

STEP 3: FILTROS
- Date range (obrigatório)
- Opcional:
  * Source
  * Trainer
  * Modalidade
  * Tier
  * Status

STEP 4: VISUALIZAÇÃO
- Escolher tipo de gráfico para cada métrica:
  * Table (tabela)
  * Line (linha temporal)
  * Bar (barras)
  * Pie (pizza)
  * Number (KPI card)

STEP 5: AGENDAR (opcional)
- Frequência: daily/weekly/monthly
- Dia da semana / dia do mês
- Hora
- Destinatários (emails)
- Formato: PDF/Excel/CSV

PREVIEW:
- Mostrar como ficará o relatório
- Botão "Gerar Agora"
- Botão "Salvar e Agendar"

RELATÓRIO GERADO:
- Layout clean
- Logo Fabrik no topo
- Título e descrição
- Filtros aplicados
- Cada métrica com:
  * Card/gráfico
  * Valor atual
  * Variação vs período anterior
- Botões: "Download PDF", "Download Excel", "Compartilhar Link"
```

---

# XVI. INTEGRAÇÕES EXTERNAS

## 🔌 WHATSAPP BUSINESS API

```typescript
// Opção 1: Twilio
// Custo: R$300-500/mês (setup rápido)

import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

export async function sendWhatsAppMessage(
  to: string,  // +5561999999999
  message: string
) {
  return await client.messages.create({
    from: 'whatsapp:+14155238886',  // Twilio sandbox
    to: `whatsapp:${to}`,
    body: message
  })
}

export async function sendTypingIndicator(to: string, enabled: boolean) {
  // Twilio não suporta typing nativo, simulate com delay
  if (enabled) {
    return await client.messages.create({
      from: 'whatsapp:+14155238886',
      to: `whatsapp:${to}`,
      body: '...'
    })
  }
}

// Webhook handler
export async function handleTwilioWebhook(req: Request) {
  const body = await req.formData()
  const from = body.get('From') as string
  const messageBody = body.get('Body') as string
  const messageId = body.get('MessageSid') as string
  
  // Process message
  await processIncomingMessage({
    phone: from.replace('whatsapp:', ''),
    message: messageBody,
    whatsapp_message_id: messageId,
    channel: 'whatsapp'
  })
  
  return new Response('OK', { status: 200 })
}
```

```typescript
// Opção 2: Meta Cloud API
// Custo: R$80-200/mês (mais escalável)

const META_ACCESS_TOKEN = process.env.META_WHATSAPP_TOKEN
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID

export async function sendWhatsAppMessage(to: string, message: string) {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: message }
      })
    }
  )
  return await response.json()
}

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  params: string[]
) {
  return await fetch(
    `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'pt_BR' },
          components: [{
            type: 'body',
            parameters: params.map(p => ({ type: 'text', text: p }))
          }]
        }
      })
    }
  )
}
```

---

## 📧 SENDGRID (Email)

```typescript
import sgMail from '@sendgrid/mail'

sgMail.setApiKey(process.env.SENDGRID_API_KEY!)

export async function sendEmail(params: {
  to: string
  subject: string
  text?: string
  html?: string
  attachments?: Array<{
    content: string  // base64
    filename: string
    type: string
    disposition: 'attachment'
  }>
}) {
  return await sgMail.send({
    from: 'contato@fabrikstudio.com.br',
    ...params
  })
}

// Templates específicos
export async function sendTrialConfirmation(
  email: string,
  trialDetails: {
    date: string
    time: string
    trainer: string
    type: 'group' | 'personal'
  }
) {
  const html = `
    <h2>Sessão Diagnóstica Confirmada! 🎉</h2>
    <p>Olá!</p>
    <p>Sua sessão diagnóstica está confirmada:</p>
    <ul>
      <li><strong>Data:</strong> ${formatDate(trialDetails.date)}</li>
      <li><strong>Horário:</strong> ${trialDetails.time}</li>
      <li><strong>Com:</strong> ${trialDetails.trainer}</li>
      <li><strong>Tipo:</strong> ${trialDetails.type === 'group' ? 'Small Group' : 'Personal Training'}</li>
    </ul>
    <p><strong>Endereço:</strong> Fabrik Studio Boutique - Lago Sul, Brasília</p>
    <p>Nos vemos lá! 💪</p>
  `
  
  return await sendEmail({
    to: email,
    subject: '✅ Sessão Diagnóstica Confirmada - Fabrik',
    html
  })
}

export async function sendInvoiceWithNFe(
  email: string,
  invoice: Invoice,
  nfePdfUrl: string
) {
  const pdfResponse = await fetch(nfePdfUrl)
  const pdfBuffer = await pdfResponse.arrayBuffer()
  const pdfBase64 = Buffer.from(pdfBuffer).toString('base64')
  
  return await sendEmail({
    to: email,
    subject: `Fatura ${invoice.invoice_number} - NF-e`,
    html: `
      <p>Olá!</p>
      <p>Segue em anexo a Nota Fiscal referente à fatura ${invoice.invoice_number}.</p>
      <p><strong>Valor:</strong> ${formatCurrency(invoice.amount)}</p>
      <p>Obrigado! 🙏</p>
    `,
    attachments: [{
      content: pdfBase64,
      filename: `NFe-${invoice.nfe_number}.pdf`,
      type: 'application/pdf',
      disposition: 'attachment'
    }]
  })
}
```

---

## 🔥 FOCUSNFE (NF-e Automático)

```typescript
const FOCUSNFE_TOKEN = process.env.FOCUSNFE_TOKEN
const FOCUSNFE_BASE_URL = 'https://api.focusnfe.com.br'

export async function emitNFe(params: {
  invoiceId: string
  student: Student
  amount: number
  description: string
}) {
  const ref = `FAB-${params.invoiceId}`
  
  // 1. Criar NF-e
  const payload = {
    natureza_operacao: "Prestação de serviços",
    data_emissao: new Date().toISOString(),
    tipo_documento: "1",
    local_destino: "1",
    presenca_comprador: "4",
    items: [{
      numero_item: "1",
      codigo_produto: "SERVICO-FABRIK",
      descricao: params.description,
      cfop: "5933",
      unidade_comercial: "UN",
      quantidade_comercial: "1",
      valor_unitario_comercial: params.amount.toString(),
      valor_bruto: params.amount.toString(),
      tributacao: "Isento"
    }],
    cliente: {
      cpf_cnpj: params.student.cpf_cnpj,
      nome: params.student.full_name,
      email: params.student.email,
      telefone: params.student.phone,
      endereco: params.student.address,
      numero: params.student.address_number,
      bairro: params.student.neighborhood,
      municipio: params.student.city,
      uf: params.student.state,
      cep: params.student.zip_code
    }
  }
  
  const createResponse = await fetch(`${FOCUSNFE_BASE_URL}/v2/nfse?ref=${ref}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(FOCUSNFE_TOKEN + ':').toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  
  if (!createResponse.ok) {
    throw new Error('Focusnfe error: ' + await createResponse.text())
  }
  
  // 2. Salvar request
  await supabase.from('nfe_requests').insert({
    invoice_id: params.invoiceId,
    focusnfe_ref: ref,
    status: 'processing'
  })
  
  // 3. Poll status (chamar de job separado)
  return { ref }
}

export async function checkNFeStatus(ref: string) {
  const response = await fetch(`${FOCUSNFE_BASE_URL}/v2/nfse/${ref}`, {
    headers: {
      'Authorization': `Basic ${Buffer.from(FOCUSNFE_TOKEN + ':').toString('base64')}`
    }
  })
  
  const data = await response.json()
  
  if (data.status === 'autorizado') {
    // NF-e emitida!
    await supabase.from('nfe_requests').update({
      status: 'issued',
      nfe_number: data.numero,
      nfe_access_key: data.chave_nfe,
      nfe_xml_url: data.caminho_xml_nota_fiscal,
      nfe_pdf_url: data.caminho_danfe,
      issued_at: new Date()
    }).eq('focusnfe_ref', ref)
    
    // Atualizar invoice
    const { data: nfeReq } = await supabase
      .from('nfe_requests')
      .select('invoice_id')
      .eq('focusnfe_ref', ref)
      .single()
    
    await supabase.from('invoices').update({
      nfe_issued: true,
      nfe_number: data.numero,
      nfe_key: data.chave_nfe,
      nfe_pdf_url: data.caminho_danfe
    }).eq('id', nfeReq.invoice_id)
    
    return { status: 'issued', data }
  } else if (data.status === 'erro') {
    await supabase.from('nfe_requests').update({
      status: 'failed',
      error_message: data.mensagem
    }).eq('focusnfe_ref', ref)
    
    return { status: 'failed', error: data.mensagem }
  } else {
    return { status: 'processing' }
  }
}

// Cron job: a cada 30s, verificar nfe_requests com status=processing
export async function pollPendingNFes() {
  const { data: pending } = await supabase
    .from('nfe_requests')
    .select('*')
    .eq('status', 'processing')
    .lt('retry_count', 10)
  
  for (const req of pending || []) {
    await checkNFeStatus(req.focusnfe_ref)
    
    await supabase.from('nfe_requests').update({
      retry_count: req.retry_count + 1
    }).eq('id', req.id)
  }
}
```

---

## 📱 MANYCHAT (Instagram/Facebook)

```typescript
// Webhook handler
export async function handleManyChatWebhook(req: Request) {
  const body = await req.json()
  
  const {
    subscriber_id,
    first_name,
    last_name,
    phone,
    email,
    custom_fields,
    tags
  } = body
  
  // Criar lead no Supabase
  const { data: lead } = await supabase.from('leads').insert({
    name: `${first_name} ${last_name}`.trim(),
    phone: phone || null,
    email: email || null,
    source: custom_fields?.source || 'instagram',
    tags: tags || [],
    external_id: subscriber_id,
    qualification_details: {
      goal: custom_fields?.objetivo,
      age: custom_fields?.idade,
      has_trained_before: custom_fields?.ja_treinou === 'sim'
    }
  }).select().single()
  
  // Calcular score
  const score = await calculateLeadScore(lead)
  await supabase.from('leads').update({
    qualification_score: score,
    status: score >= 70 ? 'qualified' : 'contacted'
  }).eq('id', lead.id)
  
  // Se qualificado + tem phone, iniciar conversa WhatsApp
  if (score >= 70 && phone) {
    await initiateWhatsAppConversation(phone, lead)
  }
  
  return new Response('OK', { status: 200 })
}

// Enviar dados de volta pro ManyChat (custom fields)
export async function updateManyChatSubscriber(
  subscriberId: string,
  fields: Record<string, any>
) {
  const MANYCHAT_API_KEY = process.env.MANYCHAT_API_KEY
  
  return await fetch(
    `https://api.manychat.com/fb/subscriber/setCustomField`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MANYCHAT_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subscriber_id: subscriberId,
        fields: Object.entries(fields).map(([key, value]) => ({
          field_name: key,
          field_value: value
        }))
      })
    }
  )
}
```

---

# XVII. CUSTOS E ROI

## 💰 CUSTOS OPERACIONAIS MENSAIS

```yaml
SaaS & Infraestrutura:
  Lovable: R$ 0 (incluído no projeto)
  Supabase Pro: R$ 125/mês
  Twilio WhatsApp: R$ 300-500/mês
  # OU Meta Cloud API: R$ 80-200/mês
  ManyChat Pro: R$ 45/mês
  SendGrid: R$ 0-150/mês (até 100k emails)
  Focusnfe: R$ 150/mês (até 100 NF-e)
  Anthropic Claude: ~R$ 100-200/mês (30k conversas @ R$0.002/msg)
  n8n Cloud (opcional): R$ 80/mês
  
TOTAL BASE (sem ads): R$ 800-1,250/mês

Marketing (opcional):
  Meta Ads: R$ 1,500-5,000/mês
  TikTok Ads: R$ 500-2,000/mês
  Google Ads: R$ 500-1,000/mês
  
TOTAL COM MARKETING: R$ 3,300-9,250/mês
```

## 📊 PROJEÇÕES DE CRESCIMENTO

```yaml
CENÁRIO 1: CONSERVADOR
  Novos alunos/mês: 10
  Ticket médio: R$ 960
  MRR adicional: R$ 9,600/mês
  Custo aquisição (CAC): R$ 330/aluno
  Investimento total: R$ 3,300/mês
  ROI: 191%
  Payback: 30 dias

CENÁRIO 2: MODERADO
  Novos alunos/mês: 15
  Ticket médio: R$ 960
  MRR adicional: R$ 14,400/mês
  Custo aquisição (CAC): R$ 320/aluno
  Investimento total: R$ 4,800/mês
  ROI: 200%
  Payback: 24 dias

CENÁRIO 3: OTIMISTA
  Novos alunos/mês: 20
  Ticket médio: R$ 960
  MRR adicional: R$ 19,200/mês
  Custo aquisição (CAC): R$ 300/aluno
  Investimento total: R$ 6,000/mês
  ROI: 220%
  Payback: 18 dias

ATENÇÃO CAPACIDADE:
  - 20 novos/mês × 12 meses = 240 novos/ano
  - Capacidade máxima: ~180 alunos
  - Atingir capacidade em: 3 meses
  - SOLUÇÃO: Ajustar quotas de trial dinamicamente
```

## 🎯 ECONOMIA DE TEMPO E ERROS

```yaml
Antes (manual):
  Gestão de leads: 4h/semana × 4 = 16h/mês
  Conciliação financeira: 8h/mês
  Folha de pagamento: 6h/mês
  Agendamentos: 4h/mês
  TOTAL: 34h/mês
  
Depois (automatizado):
  Gestão de leads: 30min/semana = 2h/mês (90% automação)
  Conciliação: 1h/mês (80% auto-match)
  Folha: 30min/mês (auto-cálculo)
  Agendamentos: 30min/mês (self-service)
  TOTAL: 4h/mês
  
ECONOMIA: 30h/mês (88% de redução)
VALOR: 30h × R$150/h (custo hora gestor) = R$ 4,500/mês

Redução de erros:
  - Erros de digitação: 95% redução
  - Pagamentos duplicados: 100% eliminados
  - NF-e não emitidas: 100% eliminadas
  - Conflitos de agendamento: 90% redução
  
ECONOMIA ANUAL: R$ 54,000 + evitar multas/problemas
```

---

# ✅ CHECKLIST FINAL DE IMPLEMENTAÇÃO

```
FASE 1 - FUNDAÇÃO:
☐ Setup Lovable project
☐ Configure Supabase
☐ Execute SQL schema (23 tabelas)
☐ Configure RLS policies
☐ Generate TypeScript types
☐ Create layout base (Header, Sidebar)
☐ Dashboard executivo
☐ CRUD Leads
☐ CRUD Alunos
☐ CRUD Trainers

FASE 2 - FINANCEIRO:
☐ Contracts & Invoices UI
☐ Transactions & Bank Statements
☐ OFX parsing function
☐ Reconciliation algorithm
☐ Reconciliation UI
☐ Focusnfe integration
☐ NF-e Edge Function
☐ NF-e status page

FASE 3 - OPERAÇÕES:
☐ Classes management
☐ Sessions calendar
☐ QR code generation (trigger já existe)
☐ Check-in UI (trainer app)
☐ Check-in UI (student app)
☐ Cancellation flow
☐ Makeup credits

FASE 4 - FOLHA:
☐ Payroll cycles
☐ Auto-calculate function
☐ Payroll UI (admin)
☐ Payroll UI (trainer)
☐ Dispute workflow
☐ Export to CSV

FASE 5 - PORTAL ALUNO:
☐ Student dashboard
☐ My sessions
☐ QR code wallet
☐ Invoice history
☐ Self-service booking

FASE 6 - MARKETING IA:
☐ WhatsApp integration (Twilio ou Meta)
☐ Claude AI integration
☐ AI system prompt config
☐ Human timing simulation
☐ ManyChat webhooks
☐ Lead scoring function
☐ Trial scheduling automation
☐ Conversations UI (admin)
☐ Nurturing sequences builder
☐ Sequence execution job

FASE 7 - GAMIFICAÇÃO:
☐ Points system (triggers já existem)
☐ Tiers config UI
☐ Rewards catalog (admin)
☐ Rewards catalog (student)
☐ Redemption workflow
☐ Leaderboard público
☐ Student gamification dashboard

FASE 8 - ANALYTICS:
☐ Analytics dashboard
☐ Conversion funnel
☐ Revenue charts
☐ Occupancy heatmap
☐ Custom reports builder
☐ Scheduled reports
☐ Export functionality

INTEGRAÇÕES:
☐ Twilio/Meta WhatsApp API keys
☐ Anthropic Claude API key
☐ Focusnfe API token
☐ SendGrid API key
☐ ManyChat API token (opcional)
☐ Wearables APIs (WHOOP, Oura, Apple) - opcional

DEPLOY & MONITORING:
☐ Configure environment variables
☐ Setup Sentry error tracking
☐ Configure Supabase backups
☐ Setup monitoring dashboard
☐ Create runbook for common issues
☐ Train team on new system

GO-LIVE:
☐ Import existing students data
☐ Import existing classes/schedule
☐ Import existing trainers
☐ Configure trial quotas
☐ Test AI conversations (sandbox)
☐ Test payment reconciliation
☐ Test NF-e emission
☐ Soft launch (1 week testing)
☐ Full launch
☐ Monitor first 30 days closely
```

---

# 🎉 FIM DA ESPECIFICAÇÃO

**Este documento contém TUDO o que você precisa para implementar a Fabrik Studio Boutique.**

**Próximos passos:**
1. Copie cada prompt Lovable na ordem
2. Execute o SQL schema no Supabase
3. Configure as integrações (APIs)
4. Siga o checklist acima

**Em 12 semanas você terá:**
✅ Sistema completo operacional  
✅ IA conversacional no WhatsApp  
✅ Automação financeira (DCC + NF-e)  
✅ Folha de pagamento automatizada  
✅ Gamificação engajando alunos  
✅ Analytics e predições  
✅ ROI de 200%+ comprovado  

**Boa implementação! 🚀💪**
