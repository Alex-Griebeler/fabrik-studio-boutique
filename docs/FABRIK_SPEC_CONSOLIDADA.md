# 📘 FABRIK - ESPECIFICAÇÃO TÉCNICA EXECUTIVA FINAL

**Sistema Completo de Gestão + CRM + Marketing Automation com IA**

*Versão: 2.0 Final Consolidada*  
*Data: 10/02/2026*  
*Elaborado para: Alex Griebeler - Fabrik Studio Boutique*

---

## 📑 ÍNDICE

```
PARTE 1 - FUNDAÇÃO (Este arquivo):
  I.   VISÃO EXECUTIVA
  II.  IDENTIDADE E POSICIONAMENTO FABRIK
  III. ARQUITETURA DO SISTEMA
  IV.  DATABASE MODEL COMPLETO (23 Tabelas + 4 Views)

PARTE 2 - MÓDULOS E CÓDIGO:
  V.   MÓDULO 1: CRM E GESTÃO DE LEADS
  VI.  MÓDULO 2: MARKETING AUTOMATION COM IA
  VII. MÓDULO 3: AGENDAMENTO INTELIGENTE
  VIII.MÓDULO 4: SESSÕES E CHECK-IN
  IX.  MÓDULO 5: FOLHA DE PAGAMENTO
  X.   MÓDULO 6: FINANCEIRO E CONCILIAÇÃO
  XI.  MÓDULO 7: GAMIFICAÇÃO

PARTE 3 - IMPLEMENTAÇÃO:
  XII. CÓDIGO TYPESCRIPT COMPLETO
  XIII.INTEGRATIONS (APIs Externas)
  XIV. INTERFACES E NAVEGAÇÃO
  XV.  ROADMAP DE IMPLEMENTAÇÃO
  XVI. PROMPTS LOVABLE (Sprint-by-Sprint)
  XVII.CUSTOS E ROI
```

---

# I. VISÃO EXECUTIVA

## 🎯 O QUE É ESTE DOCUMENTO

Especificação técnica **implementation-ready** para o sistema completo da Fabrik Studio Boutique, cobrindo todas as operações do negócio:

- **CRM completo** com pipeline de vendas
- **Marketing automation** com IA conversacional WhatsApp
- **Agendamento inteligente** (groups + personal) com quotas
- **Gestão operacional** (check-in, cancelamentos, reposições)
- **Financeiro automatizado** (DCC, conciliação, NF-e)
- **Folha de pagamento** com disputas
- **Gamificação** com benefícios reais
- **Analytics e BI**

## 📊 NÚMEROS DO NEGÓCIO

```yaml
SITUAÇÃO ATUAL:
  Alunos ativos: 120
  Receita mensal: R$ 110.000
  Distribuição:
    - Groups: 95 alunos (79%)
    - Personal: 25 alunos (21%)
    - Híbridos: ~8 alunos
  Capacidade máxima: ~180 alunos
  Ticket médio: R$ 917/mês

METAS COM AUTOMAÇÃO:
  Redução tempo admin: 18h → 2h/mês (89%)
  Conversão experimental: 70-80% (vs 60% atual)
  Economia anual: R$ 57.400 (erros + tempo)
  Crescimento: 10-20 novos alunos/mês
  ROI marketing: 192-384%
  Payback: 15-30 dias
```

## 🏗️ STACK TECNOLÓGICO

```yaml
Frontend:
  Framework: Lovable (React 18 + Vite + Tailwind CSS)
  UI Components: shadcn/ui
  Charts: Recharts
  Forms: React Hook Form + Zod
  State: Zustand
  
Backend:
  Database: Supabase (PostgreSQL 15)
  Functions: Supabase Edge Functions (Deno)
  Auth: Supabase Auth (Row Level Security)
  Storage: Supabase Storage
  Realtime: Supabase Realtime
  
IA & Automation:
  Conversational AI: Claude 4 Sonnet (Anthropic)
  WhatsApp: Twilio ou Meta Cloud API
  Orchestration: ManyChat Pro
  Workflows: n8n (opcional)
  Email: SendGrid
  
Integrações:
  Fiscal: Focusnfe (NF-e automático)
  Pagamentos: OFX parsing (DCC)
  Wearables: WHOOP, Oura, Apple Health APIs
  Ads: Meta Ads, TikTok Ads, Google Ads
  
DevOps:
  Hosting: Lovable + Supabase Cloud
  Monitoring: Supabase Dashboard + Sentry
  Backup: Supabase automated backups
```

## ⏱️ TIMELINE DE IMPLEMENTAÇÃO

```
┌─────────────────────────────────────────────────────────┐
│  FASE 1: FUNDAÇÃO (Semanas 1-2)                        │
├─────────────────────────────────────────────────────────┤
│  ✓ Setup Lovable project                               │
│  ✓ Database schema (23 tabelas)                        │
│  ✓ Auth & RLS                                           │
│  ✓ Layout base + navegação                             │
│  ✓ CRM básico (leads, students)                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  FASE 2: FINANCEIRO (Semanas 3-4)                      │
├─────────────────────────────────────────────────────────┤
│  ✓ Contracts & Invoices                                │
│  ✓ Transactions & Bank Statements                      │
│  ✓ OFX parsing                                          │
│  ✓ Conciliação automática                              │
│  ✓ Integração Focusnfe (NF-e)                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  FASE 3: OPERAÇÕES (Semanas 5-6)                       │
├─────────────────────────────────────────────────────────┤
│  ✓ Classes & Sessions                                   │
│  ✓ QR Code check-in                                     │
│  ✓ Cancelamentos com cutoff                            │
│  ✓ Trainer management                                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  FASE 4: FOLHA (Semana 7)                              │
├─────────────────────────────────────────────────────────┤
│  ✓ Payroll cycles                                       │
│  ✓ Auto-cálculo por trainer                            │
│  ✓ Dispute workflow                                     │
│  ✓ Aprovação e pagamento                               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  FASE 5: PORTAL ALUNO (Semana 8)                       │
├─────────────────────────────────────────────────────────┤
│  ✓ Dashboard aluno                                      │
│  ✓ Agendamento self-service                            │
│  ✓ QR code wallet                                       │
│  ✓ Histórico e faturas                                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  FASE 6: MARKETING AI (Semanas 9-10)                   │
├─────────────────────────────────────────────────────────┤
│  ✓ WhatsApp API integration                            │
│  ✓ Claude AI conversational agent                      │
│  ✓ ManyChat webhooks                                    │
│  ✓ Lead scoring & qualification                        │
│  ✓ Trial scheduling automation                         │
│  ✓ Nurturing sequences                                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  FASE 7: GAMIFICAÇÃO (Semanas 11-12)                   │
├─────────────────────────────────────────────────────────┤
│  ✓ Points system                                        │
│  ✓ Tiers & benefits                                     │
│  ✓ Rewards catalog                                      │
│  ✓ Redemption workflow                                  │
│  ✓ Leaderboard                                          │
│  ✓ Analytics dashboard                                  │
└─────────────────────────────────────────────────────────┘

TOTAL: 12 SEMANAS (3 MESES)
```

---

# II. IDENTIDADE E POSICIONAMENTO FABRIK

## 🎨 BRAND IDENTITY

```yaml
Nome Completo: Fabrik Studio Boutique
Tagline: Body & Mind Fitness
Localização: Lago Sul, Brasília - DF

Essência:
  - Studio boutique PREMIUM (nunca "academia")
  - Exclusivo, técnico, sofisticado
  - Performance sustentável + longevidade
  - Time-efficient (30-60min)
  - Back to Basics (método proprietário)

Público-alvo:
  Idade: 40-55 anos (sweet spot)
  Perfil: Empresários, executivos, profissionais liberais
  Renda: Alto poder aquisitivo (classe A)
  Valores: Exclusividade, qualidade, resultados reais
  Motivações: Longevidade, performance, bem-estar
  
Rejeições:
  - Academias tradicionais
  - Volume e massificação
  - Estética superficial
  - Treinos genéricos
```

## 💪 PRODUTOS E SERVIÇOS

```yaml
🎯 CARRO-CHEFE: Small Groups
  Descrição: Turmas de até 8 alunos
  Vantagens: 
    - Atenção técnica individual
    - Energia e motivação de grupo
    - Custo-benefício superior
  Participação: 79% dos alunos (95/120)
  Duração: 30 ou 60 minutos
  Método: Back to Basics
  
🎯 COMPLEMENTAR: Personal Training
  Descrição: Sessões 1-on-1 com trainer
  Vantagens:
    - Máxima personalização
    - Adaptação total ao perfil
    - Privacidade absoluta
  Participação: 21% dos alunos (25/120)
  Status: VAGAS LIMITADAS (estratégia)
  Preço: ~2x o valor dos groups
  
🎯 HÍBRIDO: Possível
  Descrição: Combinação de ambos
  Exemplo: 2x group + 1x personal/semana
  Alunos atuais: ~8 fazendo híbrido

MODALIDADES DISPONÍVEIS:
  - Back to Basics (principal)
  - HIIT
  - Flow
  - Yoga
  - Imersão no gelo
  - Exposição ao calor
  
SERVIÇOS INTEGRADOS:
  - Fisioterapia
  - Biohacking com wearables (WHOOP, Oura, Apple Watch)
  - Nutrição (em desenvolvimento)
```

## 🎯 SESSÃO DIAGNÓSTICA

**IMPORTANTE:** NÃO é "aula experimental grátis"

```yaml
O que é:
  - Avaliação personalizada e seletiva
  - Define método, duração, abordagem
  - Não é promocional nem padronizada
  - Pode ou não ser gratuita (caso a caso)
  
Quem conduz:
  Preferência: Alex Griebeler (Coordenador Técnico)
  Alternativa: Outros trainers conforme demanda
  Estratégia: Mostrar autoridade técnica
  
Quotas (CRÍTICAS):
  - Máximo: 4 experimentais/dia TOTAL
  - Máximo: 1 experimental/hora
  - Não separar por modalidade (group/personal)
  - Sujeito à capacidade do studio
  
Linguagem correta:
  ✅ "Sessão diagnóstica personalizada"
  ✅ "Avaliação com o Coordenador Técnico"
  ✅ "Atendemos número limitado de pessoas por dia"
  ✅ "Vou verificar disponibilidade do Alex"
  
  ❌ "Aula grátis"
  ❌ "Experimental gratuito"
  ❌ "Promoção especial"
  ❌ "Últimas vagas!"
```

## 📏 GLOSSÁRIO OBRIGATÓRIO

### ✅ SEMPRE USAR:

- "Studio boutique" (nunca "academia" ou "gym")
- "Sessão diagnóstica" (não "aula experimental")
- "Small groups" (não "turmas" ou "aulas em grupo")
- "Performance sustentável"
- "Longevidade e qualidade de vida"
- "Time-efficient training"
- "Back to Basics" (método proprietário)
- "Coordenador Técnico" (Alex Griebeler)
- "Biohacking aplicado"
- "Treinamento descalço"

### ❌ NUNCA USAR:

- "Academia"
- "Últimas vagas correndo"
- "Promoção imperdível"
- "Treino grátis"
- "Feche agora"
- "Oferta limitada" (usar "capacidade limitada")
- "Qualquer pessoa pode"
- Urgência artificial
- Linguagem de vendas agressiva

### 💬 FRASES PREFERIDAS:

```
✓ "Vou verificar a disponibilidade do Alex para você"
✓ "Atendemos um número limitado de pessoas por dia"
✓ "A sessão diagnóstica é personalizada para seu perfil"
✓ "Nosso foco é performance sustentável e longevidade"
✓ "Trabalhamos com small groups de até 8 alunos"
✓ "Posso te explicar como funciona e ver se faz sentido para você"
```

### 🚫 HANDOFF PARA HUMANO:

Transferir quando:
- Lead insiste em saber preços
- Negociação de desconto
- Questões clínicas complexas
- Alta intenção imediata
- Exceções de agendamento

Mensagem padrão:
```
"Vou pedir para o Alex ou alguém do time 
continuar com você, ok? Eles vão te dar 
todos os detalhes."
```

---

# III. ARQUITETURA DO SISTEMA

## 🏛️ VISÃO MACRO

```
┌───────────────────────────────────────────────────────────────┐
│                     FRONTEND (Lovable)                         │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │   GESTOR     │  │   TRAINER    │  │   ALUNO (PWA)      │ │
│  ├──────────────┤  ├──────────────┤  ├────────────────────┤ │
│  │ • CRM        │  │ • Agenda     │  │ • Minhas Sessões   │ │
│  │ • Leads      │  │ • Check-in   │  │ • QR Code          │ │
│  │ • Financeiro │  │ • Alunos     │  │ • Check-in         │ │
│  │ • Folha      │  │ • Folha      │  │ • Pontos/Tier      │ │
│  │ • Analytics  │  │ • Disputas   │  │ • Recompensas      │ │
│  │ • Config     │  │              │  │ • Faturas          │ │
│  └──────────────┘  └──────────────┘  └────────────────────┘ │
│                                                                │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────▼──────────────────────────────────┐
│                    BACKEND (Supabase)                          │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  PostgreSQL Database (23 tabelas)                             │
│  • RLS (Row Level Security)                                   │
│  • Triggers & Functions                                       │
│  • Views & Materialized Views                                 │
│                                                                │
│  Edge Functions (Deno Runtime)                                │
│  • Webhooks handlers                                          │
│  • Scheduled jobs (cron)                                      │
│  • API integrations                                           │
│  • Business logic                                             │
│                                                                │
│  Realtime Subscriptions                                       │
│  • Live updates (sessions, check-ins)                         │
│  • Notifications                                              │
│                                                                │
│  Storage                                                      │
│  • Profile photos                                             │
│  • NF-e PDFs                                                  │
│  • OFX files                                                  │
│                                                                │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────▼──────────────────────────────────┐
│                      INTEGRAÇÕES                               │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  WHATSAPP    │  │  CLAUDE AI   │  │  FOCUSNFE        │   │
│  │  (Twilio/    │  │  (Anthropic) │  │  (NF-e auto)     │   │
│  │   Meta)      │  │              │  │                  │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  MANYCHAT    │  │  SENDGRID    │  │  WEARABLES       │   │
│  │  (Instagram/ │  │  (Email)     │  │  (WHOOP/Oura/    │   │
│  │   Facebook)  │  │              │  │   Apple Watch)   │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  META ADS    │  │  TIKTOK ADS  │  │  GOOGLE ADS      │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

## 🗂️ MÓDULOS DO SISTEMA

```yaml
1. CRM & LEADS:
   - Captação multi-canal (Instagram, TikTok, Facebook, WhatsApp, Site)
   - Qualificação automática via IA
   - Lead scoring (0-100)
   - Pipeline visual (Kanban)
   - Histórico de interações

2. MARKETING AUTOMATION:
   - IA conversacional (Claude 4) no WhatsApp
   - Timing humano (typing indicators)
   - Sequências de nutrição (drip campaigns)
   - Remarketing automático
   - Analytics de conversão

3. AGENDAMENTO INTELIGENTE:
   - Quotas dinâmicas (4/dia, 1/hora)
   - Groups + Personal unificado
   - Priorizar groups (carro-chefe)
   - Fila de espera automática
   - Confirmações via WhatsApp

4. SESSÕES & CHECK-IN:
   - QR code único por sessão
   - Dual check-in (trainer + aluno)
   - Anti-fraude (geolocation + time window)
   - Cancelamento com cutoff configurável
   - Makeup credits

5. FINANCEIRO:
   - DCC reconciliation (parsing OFX)
   - Match automático transaction ↔ statement
   - NF-e automático via Focusnfe
   - Inadimplência tracking
   - Revenue recognition

6. FOLHA DE PAGAMENTO:
   - Cálculo automático por trainer
   - Taxas individuais (hourly/session/fixed)
   - Dispute workflow
   - Aprovação hierárquica
   - Export para contabilidade

7. GAMIFICAÇÃO:
   - Pontos por check-in (10 base + bônus)
   - 5 Tiers (Bronze → Diamond)
   - Rewards catalog
   - Redemption system
   - Leaderboard público

8. ANALYTICS & BI:
   - KPIs operacionais em real-time
   - Conversão por canal
   - Ocupação e capacidade
   - Predições (AI/ML)
   - Export para Excel/CSV
```

---

# IV. DATABASE MODEL COMPLETO

## 📊 DIAGRAMA RELACIONAL

```
students ─────┬──→ contracts ────→ invoices ─────→ transactions
              │                                          │
              ├──→ sessions ←──── classes               │
              │         │                                │
              │         └────────→ trainers              │
              │                                          │
              ├──→ gamification_points                  │
              │                                          │
              └──→ student_sessions_summary             │
                                                         │
leads ────────┬──→ sessions (trial)                     │
              │                                          │
              ├──→ trial_waitlist                       │
              │                                          │
              └──→ conversations ──→ conversation_messages
                                                         │
trainers ─────┬──→ sessions                             │
              │                                          │
              └──→ payroll_items ←─── payroll_cycles    │
                                                         │
invoices ─────┬──→ transactions                         │
              │                                          │
              └──→ nfe_requests                         │
                                                         │
transactions ─→ bank_statements ─→ reconciliation_matches
```

[NOTA: SQL completo das 23 tabelas + 4 views continua no arquivo...]
