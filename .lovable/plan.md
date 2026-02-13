

## Agenda estilo Google Calendar — Ajustes detalhados

### 1. Botao "Hoje" com toggle terracota

**Comportamento atual:** Clica em "Hoje" e muda para visao de dia.
**Novo comportamento:**
- Primeiro clique: navega para hoje + muda para visao dia + botao fica em terracota (variant "default" = cor primaria terracota)
- Segundo clique (ja esta em "hoje" + dia): volta para visao semanal na semana atual
- Logica: se `isViewingToday` (data == hoje E view == "day"), o botao aparece em terracota; clicar novamente reseta para `view = "week"`

**Arquivo: `Schedule.tsx`**
- Adicionar `const isViewingToday = isToday(currentDate) && view === "day"`
- `goToday`: se `isViewingToday`, entao `setView("week")`; senao, `setCurrentDate(new Date()); setView("day")`
- Botao usa `variant={isViewingToday ? "default" : "outline"}` (default = terracota)

### 2. Layout da grade estilo Google Calendar

**Problemas atuais vs Google Calendar:**
- Linhas de hora muito fracas/confusas
- Header dos dias com estilo diferente do Google
- Grid columns muito estreitas (48px para time gutter)
- Falta a linha horizontal no topo da primeira hora alinhada com o header

**Ajustes em `WeeklyCalendar.tsx`:**
- Aumentar time gutter de 48px para 56px (igual ao DailyList, consistencia)
- Labels de hora alinhados a direita com padding, estilo Google (texto cinza claro, `text-[11px]`)
- Linhas horizontais completas cruzando time gutter + colunas (no Google, a linha vai de ponta a ponta)
- Remover linhas tracejadas de meia-hora (Google nao tem) — simplifica visualmente
- Header dos dias: formato Google — dia da semana em texto pequeno cinza, numero grande embaixo; dia atual com circulo azul (no nosso caso, terracota)
- Remover `pt-4` e offset de +16 — alinhar labels de hora na borda das linhas horizontais como o Google faz (label fica "montado" sobre a linha, com metade acima e metade abaixo)
- Ajustar `HOUR_HEIGHT` para 48px (Google usa blocos mais compactos)
- Scroll inicial inteligente: rolar ate a hora atual - 1h (como Google), nao ate 06:00

**Ajustes visuais do header:**
- Remover background colorido do dia de hoje no header
- Manter apenas o circulo terracota no numero do dia atual (como Google)
- Labels "DOM", "SEG" etc em `text-[11px]` cinza, sem tracking exagerado

### 3. Filtro de modalidades — simplificar

**Ajustes em `ModalityFilterPopover.tsx`:**
- Label do botao: sempre "Modalidades" (nunca "3 de 6")
- Remover o Badge de contagem
- Dentro do popover, "Todas" funciona como toggle master: marca/desmarca todas
- Quando nenhuma esta selecionada apos desmarcar "Todas", automaticamente reativa todas (nao pode ficar vazio sem mostrar nada)
- Logica: "Todas" desmarcada = nenhum filtro ativo (mostra todas); ao desmarcar individualmente e chegar em 0, reativa "Todas"

### Detalhes tecnicos completos

**`src/pages/Schedule.tsx`**
- Import `isToday` de `date-fns`
- `const isViewingToday = isToday(currentDate) && view === "day"`
- `goToday`: condicional — se ja esta em hoje+dia, volta para semana; senao, vai para hoje+dia
- Botao "Hoje": `variant={isViewingToday ? "default" : "outline"}`

**`src/components/schedule/WeeklyCalendar.tsx`** (reescrita significativa)
- `HOUR_HEIGHT = 48` (mais compacto, estilo Google)
- Time gutter: `56px` em vez de `48px`
- Remover `pt-4` e todos os offsets `+16`
- Labels de hora posicionados em `top: (hour - START_HOUR) * HOUR_HEIGHT` com `-translate-y-1/2` (sobre a linha)
- Linhas horizontais em cada hora, sem linhas tracejadas de meia hora
- Linhas cruzam toda a largura (incluindo gutter) — grid line unica `absolute left-0 right-0`
- Header: `text-[11px]` para dia da semana, `text-base` para numero, circulo terracota para hoje
- Scroll inicial: `Math.max(0, (Math.max(START_HOUR, currentHour - 1) - START_HOUR) * HOUR_HEIGHT)`
- CurrentTimeLine: remover offset +16

**`src/components/schedule/ModalityFilterPopover.tsx`**
- Label sempre "Modalidades", sem badge de contagem
- Toggle "Todas": ao desmarcar, mantém todas visiveis (array vazio = todas)
- Ao desmarcar todas individualmente, reseta para array vazio (= todas visiveis)

