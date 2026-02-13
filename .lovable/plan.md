

## Correcoes finais da Agenda

### 1. Filtro "Todas" — corrigir logica de toggle

**Problema raiz:** O estado usa a convencao `selected = []` para significar "todas selecionadas". Isso cria um conflito logico porque clicar "Todas" para desmarcar tambem resulta em `[]`, tornando impossivel distinguir "todas marcadas" de "todas desmarcadas".

**Solucao: mudar para arrays explicitos.**

**`Schedule.tsx`:**
- Inicializar `modalityFilter` com todos os slugs quando as modalidades carregam via `useEffect`
- Manter o filtro do parent: `modalityFilter.length === 0 || modalityFilter.includes(s.modality)` (sem mudanca — empty = show all como fallback)

**`ModalityFilterPopover.tsx` — reescrever a logica:**
- `allSelected = selected.length === total && total > 0`
- `toggleAll`: se `allSelected` entao `onChange([])` (desmarcar tudo); senao `onChange(all slugs)` (marcar tudo)
- `toggle(slug)`: adiciona/remove do array normalmente; se atingir `total`, nao normaliza (deixa explicito)
- `isChecked(slug)`: `selected.includes(slug)` (sem shortcut de "allSelected")
- Checkbox "Todas": `checked={allSelected}`

**Comportamento resultante:**
- Estado inicial: todas marcadas (array com todos os slugs)
- Click "Todas": desmarca tudo (array vazio), filtro mostra tudo (fallback)
- Click "Todas" de novo: marca tudo (array cheio)
- Desmarcar 1 individual: "Todas" desmarca automaticamente
- Marcar todas manualmente: "Todas" marca automaticamente

### 2. Grade semanal — corrigir label 06:00 cortado

**Problema:** O label "06:00" esta posicionado em `top: 0` com `-translate-y-1/2`, fazendo metade dele ficar acima do container (cortado pelo overflow).

**Solucao em `WeeklyCalendar.tsx`:**
- Adicionar `pt-3` (12px) ao container relativo da grade
- Ajustar `totalHeight` para `HOURS.length * HOUR_HEIGHT + 12` (compensar o padding)
- Somar `12` ao calculo de `top` de todos os elementos: labels de hora, linhas horizontais, posicao dos cards, e CurrentTimeLine
- Isso garante que "06:00" fique totalmente visivel sem cortar

### Detalhes tecnicos

**`src/pages/Schedule.tsx`:**
- Adicionar `useEffect` para inicializar `modalityFilter` com `modalities.map(m => m.slug)` quando `modalities` carrega e `modalityFilter` esta vazio

**`src/components/schedule/ModalityFilterPopover.tsx`:**
- `allSelected = selected.length === total && total > 0`
- `toggleAll()`: `allSelected ? onChange([]) : onChange(modalities.map(m => m.slug))`
- `toggle(slug)`: remove se presente, adiciona se ausente (sem normalizacao para `[]` ou auto-reset)
- `isChecked(slug)`: `selected.includes(slug)`

**`src/components/schedule/WeeklyCalendar.tsx`:**
- Constante `TOP_PADDING = 12`
- Container relativo: `style={{ height: totalHeight + TOP_PADDING, paddingTop: TOP_PADDING }}`
- Linhas horizontais: `top: (hour - START_HOUR) * HOUR_HEIGHT + TOP_PADDING`
- Labels de hora: `top: (hour - START_HOUR) * HOUR_HEIGHT + TOP_PADDING`
- `getTimePosition`: retorna `(h - START_HOUR + m/60) * HOUR_HEIGHT + TOP_PADDING`
- `CurrentTimeLine`: `top: (h - START_HOUR + m/60) * HOUR_HEIGHT + TOP_PADDING`

