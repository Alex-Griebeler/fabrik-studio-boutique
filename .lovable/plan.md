

## Filtro de Modalidades na Agenda

### Problema atual
Todas as modalidades aparecem como botões individuais na toolbar da agenda, ocupando espaço e poluindo a interface visualmente (como visto no screenshot: "Todas", "Back to Basics", "HIIT", "Personal", "Flow", "Recovery", "Yoga").

### Solucao

Substituir a lista de botoes por um **Popover com checkboxes**, permitindo selecionar multiplas modalidades ao mesmo tempo. O botao trigger mostra um resumo (ex: "3 modalidades" ou "Todas").

### Comportamento
- Botao com icone de filtro + label dinamico ("Todas" ou "2 de 6")
- Ao clicar, abre Popover com lista de checkboxes (uma por modalidade)
- Opcao "Todas" no topo como atalho para selecionar/desmarcar tudo
- Filtragem aceita multiplas modalidades simultaneamente
- Badge com contagem quando nao sao todas

### Detalhes tecnicos

**Arquivo: `src/pages/Schedule.tsx`**
- Mudar `modalityFilter` de `string` para `string[]` (array de slugs selecionados)
- Array vazio = todas selecionadas
- Substituir os botoes de modalidade por um componente `ModalityFilterPopover`
- Atualizar a logica de filtragem passada aos componentes filhos

**Arquivo novo: `src/components/schedule/ModalityFilterPopover.tsx`**
- Popover com Checkbox para cada modalidade
- Toggle "Todas" no topo
- Usa cores das modalidades como indicadores visuais
- Design minimalista alinhado com o restante do app

**Arquivos ajustados para multi-filter:**
- `WeeklyCalendar.tsx` — prop `modalityFilter` muda de `string` para `string[]`, filtro usa `.includes()`
- `DailyList.tsx` — mesma mudanca de filtro

