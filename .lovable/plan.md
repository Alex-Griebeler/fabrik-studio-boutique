

## Ajustes na Tela Agenda

### Problemas identificados (screenshot)

1. **Grade 06:00 cortada** — o scroll inicial posiciona a grade mas o label "06:00" fica parcialmente oculto
2. **Botao "Hoje"** — atualmente so navega para a data de hoje; deveria alternar para a visao de dia (detalhamento)
3. **Tamanho dos botoes inconsistente** — "Configurar" e "Nova Sessao" aparecem com tamanhos diferentes no PageHeader vs toolbar
4. **Botao "Todas"** — deveria ser "Modalidades" (ja discutido, mas nao aplicado no componente)
5. **Duplicidade** — "Configurar" e "Nova Sessao" aparecem tanto no PageHeader (topo) quanto na toolbar (meio)

### Solucao

**1. Grade 06:00 visivel**
- Em `WeeklyCalendar.tsx`, adicionar padding-top no container do scroll para que o label "06:00" nao fique cortado
- Ajustar o scroll inicial para considerar esse padding

**2. Botao "Hoje" abre visao de dia**
- Em `Schedule.tsx`, o `goToday` alem de setar `currentDate` para hoje, tambem muda `view` para `"day"`

**3. Padronizar tamanho dos botoes**
- Todos os botoes da toolbar usarao `size="sm"` consistentemente
- Os botoes do view toggle ja usam `size="icon"` com `h-8 w-8`, manter

**4. Renomear "Todas" para "Modalidades"**
- Em `ModalityFilterPopover.tsx`, mudar o label do trigger de `"Todas"` para `"Modalidades"` quando todas estao selecionadas

**5. Remover duplicidade**
- Remover os botoes "Configurar" e "Nova Sessao" do `PageHeader.actions` (topo da pagina)
- Manter apenas os da toolbar, onde estao agrupados com navegacao e filtros

### Detalhes tecnicos

**`src/pages/Schedule.tsx`**
- Remover o bloco `actions={...}` do `PageHeader` (linhas 49-70 aprox.)
- Alterar `goToday` para: `setCurrentDate(new Date()); setView("day");`

**`src/components/schedule/WeeklyCalendar.tsx`**
- Adicionar `pt-4` ou `pt-6` ao container scrollavel para garantir que "06:00" fique visivel
- Ajustar `scrollTop` inicial para compensar o padding

**`src/components/schedule/ModalityFilterPopover.tsx`**
- Mudar `const label = allSelected ? "Todas" : ...` para `const label = allSelected ? "Modalidades" : ...`

