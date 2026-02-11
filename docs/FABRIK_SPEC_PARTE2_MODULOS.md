# 📘 FABRIK - PARTE 2: MÓDULOS FUNCIONAIS

**Especificação dos módulos de negócio e regras críticas**

---

# V. MÓDULO 1: CRM E GESTÃO DE LEADS

## 🎯 OBJETIVO

Sistema completo de captação, qualificação e conversão de leads em alunos pagantes.

## 📥 CAPTAÇÃO MULTI-CANAL

### **Canais Ativos:**

```yaml
Instagram:
  - Posts orgânicos
  - Stories com CTA
  - DM automation (ManyChat)
  - Ads (Meta Ads Manager)
  
Facebook:
  - Page posts
  - Lead Gen Ads
  - Messenger automation (ManyChat)
  
TikTok:
  - Vídeos virais
  - Lead Gen Forms
  - Link in bio
  
WhatsApp:
  - QR code no studio
  - Link em bio (wa.me)
  - WhatsApp Business API
  
Website:
  - Landing page
  - Contact form
  - Chat widget
  
Referral:
  - Member get member
  - Partner referrals
```

### **Webhook ManyChat → Supabase:**

```typescript
// Edge Function: manychat-webhook
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { first_name, last_name, phone, email, custom_fields, tags } = await req.json()
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  
  // Criar lead
  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      name: `${first_name} ${last_name}`.trim(),
      phone,
      email,
      source: custom_fields.source || 'instagram',
      utm_params: custom_fields.utm,
      qualification_details: {
        goal: custom_fields.objetivo,
        has_trained_before: custom_fields.ja_treinou === 'sim',
        time_preference: custom_fields.horario_preferido
      },
      tags: tags || []
    })
    .select()
    .single()
  
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }
  
  // Auto-qualificar
  const qualificationScore = await calculateLeadScore(lead)
  
  await supabase
    .from('leads')
    .update({ 
      qualification_score: qualificationScore,
      status: qualificationScore >= 70 ? 'qualified' : 'contacted'
    })
    .eq('id', lead.id)
  
  // Se qualificado, iniciar conversa WhatsApp
  if (qualificationScore >= 70 && phone) {
    await initiateWhatsAppConversation(phone, lead)
  }
  
  return new Response(JSON.stringify({ success: true, lead }), { status: 200 })
})
```

## 🎯 QUALIFICAÇÃO AUTOMÁTICA

### **Lead Scoring (0-100):**

```typescript
async function calculateLeadScore(lead: Lead): Promise<number> {
  let score = 0
  const details = lead.qualification_details || {}
  
  // AGE (estimado ou perguntado)
  const age = details.age
  if (age >= 40 && age <= 55) {
    score += 25 // Sweet spot
  } else if (age >= 30 && age < 40) {
    score += 15
  } else if (age >= 25 && age < 30) {
    score += 10
  } else if (age < 25) {
    score += 5
  }
  
  // PROFESSIONAL PROFILE
  const professionTier = details.profession_tier
  if (professionTier === 'executive' || professionTier === 'entrepreneur') {
    score += 25
  } else if (professionTier === 'professional') {
    score += 15
  }
  
  // GOAL ALIGNMENT
  const compatibleGoals = ['performance', 'longevity', 'quality_of_life', 'stress_management']
  if (compatibleGoals.includes(details.goal)) {
    score += 20
  } else if (details.goal === 'weight_loss') {
    score += 10
  } else if (details.goal === 'extreme_hypertrophy') {
    score -= 10 // Não é foco
  }
  
  // LOCATION (Brasília)
  if (details.city === 'Brasília' || details.neighborhood?.includes('Lago Sul')) {
    score += 15
  } else if (details.city === 'Brasília') {
    score += 10
  }
  
  // BUDGET SIGNALS
  if (details.budget_tier === 'premium') {
    score += 10
  } else if (details.mentioned_price_concern) {
    score -= 5
  }
  
  // URGENCY
  if (details.start_urgency === 'immediate') {
    score += 5
  }
  
  return Math.min(100, Math.max(0, score))
}
```

### **Grades:**

```
A (75-100): HOT - Prioridade máxima, ação imediata
B (50-74):  WARM - Qualificado, nutrir ativamente
C (25-49):  COLD - Nutrir passivamente
D (0-24):   VERY COLD - Baixa prioridade
```

## 📊 PIPELINE VISUAL (Kanban)

```
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│    NEW      │  CONTACTED  │  QUALIFIED  │TRIAL SCHED. │  CONVERTED  │
│             │             │             │             │             │
│  Lead 1 (A) │  Lead 4 (B) │  Lead 7 (A) │ Lead 10 (A) │  Student 1  │
│  Lead 2 (C) │  Lead 5 (A) │  Lead 8 (B) │ Lead 11 (B) │  Student 2  │
│  Lead 3 (B) │  Lead 6 (C) │  Lead 9 (A) │             │             │
│             │             │             │             │             │
│   [+Add]    │             │             │             │             │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
```

---

# VI. MÓDULO 2: MARKETING AUTOMATION COM IA

## 🤖 IA CONVERSACIONAL (Claude 4 Sonnet)

### **System Prompt Base:**

```typescript
const FABRIK_AI_SYSTEM_PROMPT = `
Você é o assistente de vendas da Fabrik Studio Boutique em Brasília.

IDENTIDADE FABRIK:
- Studio boutique premium (NUNCA "academia")
- Método: Back to Basics
- Foco: Performance sustentável + longevidade
- Público: 40-55 anos, alto poder aquisitivo
- Small groups (até 8 alunos) = CARRO-CHEFE
- Personal training = complementar, vagas limitadas

PERSONALIDADE:
- Profissional mas acessível
- Entusiasta mas não exagerado
- Direto mas empático
- Use linguagem natural brasileira (mas elegante)
- 1-2 emojis MAX por mensagem
- NUNCA robotizado

OBJETIVOS (EM ORDEM):
1. Qualificar lead (objetivo, rotina, alinhamento)
2. Criar desejo pela transformação
3. Agendar sessão diagnóstica
4. Converter em aluno

REGRAS CRÍTICAS:
❌ NUNCA discutir preços (handoff para humano)
❌ NUNCA usar "últimas vagas", "promoção", "oferta"
✅ SEMPRE priorizar small groups (90% dos casos)
✅ SEMPRE verificar disponibilidade Alex (autoridade)
✅ SEMPRE uma pergunta por vez
✅ Escassez REAL: "capacidade limitada", "número restrito"

LINGUAGEM PROIBIDA:
- "Aula grátis", "experimental grátis"
- "Feche agora", "última chance"
- "Academia", "gym"

LINGUAGEM PREFERIDA:
- "Sessão diagnóstica personalizada"
- "Vou verificar disponibilidade do Alex"
- "Atendemos número limitado de pessoas por dia"
- "Studio boutique"
- "Small groups"

HANDOFF PARA HUMANO:
- Lead insiste em preço
- Negociação/desconto
- Questões clínicas complexas
- Alta intenção (quer fechar agora)

CONHECIMENTO:
${JSON.stringify(FABRIK_KNOWLEDGE)}
`

const FABRIK_KNOWLEDGE = {
  location: "Lago Sul, Brasília - DF",
  coordinator: "Alex Griebeler (Coordenador Técnico)",
  modalities: ["Back to Basics", "HIIT", "Flow", "Yoga"],
  session_duration: "30 ou 60 minutos",
  group_size: "Até 8 alunos",
  trial_quota: "4 por dia (total)",
  target_age: "40-55 anos",
  focus: "Performance sustentável e longevidade",
  differentials: [
    "Time-efficient (30min)",
    "Treinamento descalço",
    "Biohacking com wearables",
    "Atenção técnica individual em grupo"
  ]
}
```

### **Função Principal:**

```typescript
async function processAIMessage(
  conversationId: string,
  userMessage: string
): Promise<string> {
  
  const { data: conversation } = await supabase
    .from('conversations')
    .select('*, messages:conversation_messages(*)')
    .eq('id', conversationId)
    .single()
  
  // Construir histórico
  const messages = conversation.messages.map(m => ({
    role: m.role,
    content: m.content
  }))
  
  // Adicionar nova mensagem do usuário
  messages.push({ role: 'user', content: userMessage })
  
  // Enriquecer system prompt com contexto
  const enrichedPrompt = FABRIK_AI_SYSTEM_PROMPT + `

CONTEXTO DA CONVERSA:
Stage: ${conversation.context.stage || 'initial'}
Objetivo identificado: ${conversation.context.goal || 'desconhecido'}
Modalidade sugerida: ${conversation.context.suggested_modality || 'group'}
Últimas interações: ${conversation.message_count}
  `
  
  // Chamar Claude API
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: enrichedPrompt,
      messages
    })
  })
  
  const data = await response.json()
  const assistantMessage = data.content[0].text
  
  // Salvar mensagens
  await supabase.from('conversation_messages').insert([
    { conversation_id: conversationId, role: 'user', content: userMessage },
    { conversation_id: conversationId, role: 'assistant', content: assistantMessage,
      ai_model: 'claude-sonnet-4', ai_prompt_tokens: data.usage.input_tokens,
      ai_completion_tokens: data.usage.output_tokens }
  ])
  
  // Atualizar contexto da conversa
  await updateConversationContext(conversationId, assistantMessage)
  
  // Verificar ações automáticas
  await checkAndExecuteActions(conversationId, assistantMessage)
  
  return assistantMessage
}
```

### **Timing Humano:**

```typescript
function calculateHumanDelay(message: string): number {
  const wordCount = message.split(/\s+/).length
  const charCount = message.length
  
  // Reading time: 200ms per word
  const readingTime = wordCount * 200
  
  // Typing time: 50ms per char
  const typingTime = charCount * 50
  
  // Total with random variation (±20%)
  const baseDelay = readingTime + typingTime
  const variation = baseDelay * 0.2
  const randomDelay = baseDelay + (Math.random() * variation * 2 - variation)
  
  // Min 2s, Max 10s
  return Math.min(10000, Math.max(2000, randomDelay))
}

async function sendWhatsAppWithHumanTiming(
  phone: string,
  message: string
) {
  // Show typing indicator
  await sendTypingIndicator(phone, true)
  
  // Wait human delay
  const delay = calculateHumanDelay(message)
  await new Promise(resolve => setTimeout(resolve, delay))
  
  // Stop typing
  await sendTypingIndicator(phone, false)
  
  // Send message
  await sendWhatsAppMessage(phone, message)
}
```

## 📧 SEQUÊNCIAS DE NUTRIÇÃO

```typescript
const NURTURING_SEQUENCES = {
  'instagram-captured': {
    trigger: 'lead_created_from_instagram',
    messages: [
      {
        delay_hours: 0,
        channel: 'whatsapp',
        template: (lead) => `Oi ${lead.name}! 👋

Vi que você se interessou pela Fabrik no Instagram.

Posso te contar mais sobre como funciona?`
      },
      {
        delay_hours: 24,
        channel: 'whatsapp',
        condition: (lead) => !lead.last_interaction_at,
        template: () => `Oi! Preparei um vídeo rápido mostrando o studio e como funcionam as sessões.

Quer dar uma olhada? 📹`
      },
      {
        delay_hours: 72,
        channel: 'whatsapp',
        condition: (lead) => !lead.trial_date,
        template: () => `Que tal conhecer na prática?

Posso agendar uma sessão diagnóstica personalizada para você. O que acha? 💪`
      },
      {
        delay_hours: 168,
        channel: 'whatsapp',
        condition: (lead) => !lead.trial_date && !lead.lost_reason,
        template: () => `Oi! Última tentativa aqui 😊

Se ainda tiver interesse em conhecer a Fabrik, é só me chamar. 

Caso não faça mais sentido, sem problemas!`
      }
    ]
  },
  
  'post-trial': {
    trigger: 'trial_completed',
    messages: [
      {
        delay_hours: 2,
        channel: 'whatsapp',
        template: (lead) => `E aí ${lead.name}, como foi a experiência hoje? 😊`
      },
      {
        delay_hours: 24,
        channel: 'whatsapp',
        condition: (lead) => !lead.converted_to_student_id,
        template: () => `Preparei uma proposta exclusiva pra você!

Posso te mandar os detalhes? 📋`
      },
      {
        delay_hours: 48,
        channel: 'whatsapp',
        condition: (lead) => !lead.converted_to_student_id,
        template: () => `Só lembrando que a proposta tem validade até sexta-feira 😉

Consegue dar uma olhada?`
      }
    ]
  }
}
```

---

# VII. MÓDULO 3: AGENDAMENTO INTELIGENTE

## 🎯 ESTRATÉGIA (CRÍTICA)

**PRIORIDADE ABSOLUTA: SMALL GROUPS**

```yaml
Regra de ouro:
  - 90% dos leads → Small Groups
  - 10% dos leads → Personal (apenas casos específicos)

Personal APENAS quando:
  - Lead pede explicitamente
  - Restrições médicas severas
  - Reabilitação pós-cirurgia
  - Coordenador indica
  - Perfil VIP extremo (privacidade absoluta)

Comunicação de escassez:
  Personal: "As vagas são bem limitadas no momento"
  Groups: "Vou verificar a disponibilidade"
```

## 📅 QUOTAS DINÂMICAS

### **Configuração Global:**

```typescript
const TRIAL_CONFIG = {
  max_per_day: 4,        // TOTAL (group + personal)
  max_per_hour: 1,       // TOTAL
  max_per_week: 20,
  max_per_month: 80,
  
  preferred_hours: ['07:00', '09:00', '18:00', '19:00'],
  blackout_hours: ['12:00', '13:00', '14:00'],
  
  by_weekday: {
    0: 0,  // Domingo: não oferece
    1: 4,  // Segunda
    2: 4,  // Terça
    3: 4,  // Quarta
    4: 4,  // Quinta
    5: 3,  // Sexta
    6: 2   // Sábado
  },
  
  // Buffer para groups
  min_regular_students: 8,   // Antes de aceitar trial
  max_trials_per_class: 1,   // Máximo 1 trial por turma
  
  waitlist_enabled: true
}
```

### **Algoritmo de Slots:**

```typescript
async function findAvailableTrialSlots(params: {
  session_type: 'group' | 'personal'
  date_from: Date
  date_to: Date
}): Promise<TrialSlot[]> {
  
  const config = await getTrialConfig()
  const slots: TrialSlot[] = []
  
  if (params.session_type === 'group') {
    // GROUPS: turmas fixas
    const classes = await supabase
      .from('classes')
      .select('*, trainer:trainers!inner(*)')
      .gte('date', params.date_from)
      .lte('date', params.date_to)
      .eq('active', true)
    
    for (const cls of classes.data) {
      const dayQuota = await getDayQuota(cls.date)
      
      // Checks de quota
      if (dayQuota.trials_booked_today >= config.max_per_day) continue
      if (dayQuota.trials_booked_this_week >= config.max_per_week) continue
      if (dayQuota.occupied_hours[cls.start_time] >= 1) continue
      
      // Checks de capacidade da turma
      const enrollmentCount = await getClassEnrollmentCount(cls.id)
      const trialCount = await getClassTrialCount(cls.id)
      
      if (enrollmentCount < config.min_regular_students) continue
      if (trialCount >= config.max_trials_per_class) continue
      if (!cls.trainer.can_do_trials) continue
      
      // VÁLIDO!
      slots.push({
        type: 'trial_group',
        class_id: cls.id,
        date: cls.date,
        start_time: cls.start_time,
        trainer: cls.trainer.full_name,
        is_alex: cls.trainer.is_coordinator
      })
    }
    
  } else {
    // PERSONAL: mais flexível
    const trainers = await supabase
      .from('trainers')
      .select('*')
      .eq('can_do_personal', true)
      .eq('can_do_trials', true)
      .eq('active', true)
      .order('is_coordinator', { ascending: false }) // Alex primeiro
    
    for (const trainer of trainers.data) {
      const days = eachDayOfInterval({ start: params.date_from, end: params.date_to })
      
      for (const day of days) {
        const dayQuota = await getDayQuota(day)
        
        if (dayQuota.trials_booked_today >= config.max_per_day) continue
        
        const availableHours = await getTrainerAvailableHours(trainer.id, day)
        
        for (const hour of availableHours) {
          if (dayQuota.occupied_hours[hour] >= 1) continue
          
          slots.push({
            type: 'trial_personal',
            trainer_id: trainer.id,
            date: day,
            start_time: hour,
            trainer: trainer.full_name,
            is_alex: trainer.is_coordinator
          })
        }
      }
    }
  }
  
  // Ordenar: Alex primeiro, depois por data
  slots.sort((a, b) => {
    if (a.is_alex && !b.is_alex) return -1
    if (!a.is_alex && b.is_alex) return 1
    return a.date.getTime() - b.date.getTime()
  })
  
  return slots.slice(0, 5) // Max 5 opções
}
```

### **Booking com Enforcement:**

```typescript
async function bookTrialSession(
  leadId: string,
  slot: TrialSlot
): Promise<BookingResult> {
  
  const config = await getTrialConfig()
  const dayQuota = await getDayQuota(slot.date)
  
  // CRITICAL CHECKS
  if (dayQuota.trials_booked_today >= config.max_per_day) {
    return { success: false, reason: 'daily_quota_exceeded' }
  }
  
  if (dayQuota.occupied_hours[slot.start_time] >= 1) {
    return { success: false, reason: 'hour_occupied' }
  }
  
  // LOCK para evitar race condition
  const lock = await acquireLock(`trial_booking_${slot.date}_${slot.start_time}`)
  
  try {
    // Criar sessão
    const session = await supabase.from('sessions').insert({
      session_type: slot.type,
      lead_id: leadId,
      trainer_id: slot.trainer_id,
      class_id: slot.class_id,
      scheduled_date: slot.date,
      scheduled_start_time: slot.start_time,
      scheduled_end_time: addMinutes(slot.start_time, 60),
      duration_minutes: 60,
      is_trial: true,
      status: 'scheduled'
    }).select().single()
    
    // Atualizar quota
    await supabase.from('trial_quotas').update({
      trials_booked_today: dayQuota.trials_booked_today + 1,
      trials_booked_this_week: dayQuota.trials_booked_this_week + 1,
      trials_booked_this_month: dayQuota.trials_booked_this_month + 1,
      occupied_hours: {
        ...dayQuota.occupied_hours,
        [slot.start_time]: 1
      }
    }).eq('date', slot.date)
    
    // Atualizar lead
    await supabase.from('leads').update({
      status: 'trial_scheduled',
      trial_date: slot.date,
      trial_time: slot.start_time,
      trial_type: slot.type === 'trial_group' ? 'group' : 'personal'
    }).eq('id', leadId)
    
    // Notificar
    await sendTrialConfirmation(leadId, session.data)
    
    return { success: true, session: session.data }
    
  } finally {
    await releaseLock(lock)
  }
}
```

## 🎯 FILA DE ESPERA

```typescript
async function addToWaitlist(
  leadId: string,
  preferences: WaitlistPreferences
): Promise<void> {
  
  // Calcular posição na fila
  const { count } = await supabase
    .from('trial_waitlist')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'waiting')
  
  await supabase.from('trial_waitlist').insert({
    lead_id: leadId,
    preferred_dates: preferences.dates,
    preferred_times: preferences.times,
    session_type_preference: preferences.type || 'any',
    flexibility: preferences.flexibility || 'moderate',
    position: count + 1,
    status: 'waiting'
  })
  
  // Notificar lead
  await sendWaitlistConfirmation(leadId, count + 1)
}

// Job: processar fila quando slot abre
async function processWaitlist() {
  // Buscar slots disponíveis hoje/amanhã
  const availableSlots = await findAvailableTrialSlots({
    session_type: 'group',
    date_from: new Date(),
    date_to: addDays(new Date(), 1)
  })
  
  if (availableSlots.length === 0) return
  
  // Buscar próximo na fila
  const { data: waitlistEntry } = await supabase
    .from('trial_waitlist')
    .select('*, lead:leads(*)')
    .eq('status', 'waiting')
    .order('position', { ascending: true })
    .limit(1)
    .single()
  
  if (!waitlistEntry) return
  
  // Encontrar slot compatível
  const matchingSlot = availableSlots.find(slot =>
    matchesPreferences(slot, waitlistEntry)
  )
  
  if (matchingSlot) {
    // Oferecer slot (24h para responder)
    await supabase.from('trial_waitlist').update({
      status: 'offered',
      offered_at: new Date(),
      offered_slot_id: matchingSlot.id,
      offer_expires_at: addHours(new Date(), 24)
    }).eq('id', waitlistEntry.id)
    
    await sendWaitlistOffer(waitlistEntry.lead, matchingSlot)
  }
}
```

---

[Arquivo continua com os módulos 4-7...]

---

# VIII. MÓDULO 4: SESSÕES E CHECK-IN

## 📱 QR CODE CHECK-IN

### **Geração de QR Code:**

Trigger SQL já criado na tabela `sessions` gera automaticamente:
- QR code único (32 chars hex)
- Expira em 90min após horário da sessão

### **Validação de Check-in:**

```typescript
async function validateCheckIn(
  qrCode: string,
  userId: string,
  userType: 'trainer' | 'student',
  location?: { lat: number, lng: number }
): Promise<CheckInResult> {
  
  // Buscar sessão pelo QR
  const { data: session } = await supabase
    .from('sessions')
    .select('*, student:students(*), trainer:trainers(*)')
    .eq('qr_code', qrCode)
    .single()
  
  if (!session) {
    return { success: false, error: 'QR code inválido' }
  }
  
  // Verificar expiração
  if (new Date() > new Date(session.qr_code_expires_at)) {
    return { success: false, error: 'QR code expirado' }
  }
  
  // Verificar usuário correto
  if (userType === 'trainer' && userId !== session.trainer_id) {
    return { success: false, error: 'QR code não pertence a você' }
  }
  if (userType === 'student' && userId !== session.student_id) {
    return { success: false, error: 'QR code não pertence a você' }
  }
  
  // Verificar time window (30min antes até fim da sessão)
  const sessionStart = new Date(`${session.scheduled_date} ${session.scheduled_start_time}`)
  const sessionEnd = new Date(`${session.scheduled_date} ${session.scheduled_end_time}`)
  const now = new Date()
  const earliestCheckIn = subMinutes(sessionStart, 30)
  
  if (now < earliestCheckIn) {
    return { success: false, error: 'Check-in muito cedo (30min antes)' }
  }
  if (now > sessionEnd) {
    return { success: false, error: 'Sessão já terminou' }
  }
  
  // Verificar geolocalização (opcional mas recomendado)
  if (location) {
    const STUDIO_LOCATION = { lat: -15.8356, lng: -47.9117 } // Lago Sul
    const distance = calculateDistance(location, STUDIO_LOCATION)
    
    if (distance > 100) { // 100m tolerance
      // Marcar como suspeito mas permitir
      await supabase.from('sessions').update({
        location_mismatch: true
      }).eq('id', session.id)
    }
  }
  
  // Registrar check-in
  const checkInField = userType === 'trainer' ? 'trainer_checked_in_at' : 'student_checked_in_at'
  const locationField = userType === 'trainer' ? 'trainer_check_in_location' : 'student_check_in_location'
  
  await supabase.from('sessions').update({
    [checkInField]: new Date(),
    [locationField]: location ? `POINT(${location.lng} ${location.lat})` : null,
    status: 'in_progress'
  }).eq('id', session.id)
  
  // Se ambos fizeram check-in, marcar como completed
  const updated = await supabase
    .from('sessions')
    .select('trainer_checked_in_at, student_checked_in_at')
    .eq('id', session.id)
    .single()
  
  if (updated.data.trainer_checked_in_at && updated.data.student_checked_in_at) {
    await supabase.from('sessions').update({
      status: 'completed'
    }).eq('id', session.id)
  }
  
  return { success: true, session }
}
```

## ❌ CANCELAMENTO COM CUTOFF

```typescript
async function requestCancellation(
  sessionId: string,
  userId: string,
  reason: string
): Promise<CancellationResult> {
  
  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single()
  
  // Verificar cutoff (configurável, ex: 12h antes)
  const CANCELLATION_CUTOFF_HOURS = 12
  const sessionStart = new Date(`${session.scheduled_date} ${session.scheduled_start_time}`)
  const cutoffTime = subHours(sessionStart, CANCELLATION_CUTOFF_HOURS)
  const now = new Date()
  
  const withinCutoff = now <= cutoffTime
  
  // Processar cancelamento
  await supabase.from('sessions').update({
    status: 'cancelled',
    cancelled_at: now,
    cancelled_by: 'student',
    cancellation_reason: reason,
    within_cancellation_cutoff: withinCutoff
  }).eq('id', sessionId)
  
  // Se dentro do cutoff, gerar makeup credit
  if (withinCutoff) {
    await generateMakeupCredit(session.student_id, sessionId)
    
    return {
      success: true,
      message: 'Cancelamento confirmado. Crédito de reposição gerado.',
      makeup_credit: true
    }
  } else {
    return {
      success: true,
      message: 'Cancelamento confirmado. Fora do prazo para reposição.',
      makeup_credit: false
    }
  }
}
```

---

[Continuando...]
