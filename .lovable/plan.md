

# Calendario com selecao de ano/mes para Data de Nascimento

## Problema

O calendario atual so permite navegar mes a mes. Para selecionar uma data de nascimento (ex: 1973), o usuario precisaria clicar na seta "voltar" mais de 600 vezes.

## Solucao

Utilizar o recurso nativo do `react-day-picker` (v8) que ja suporta dropdowns de mes e ano no cabecalho do calendario, sem precisar instalar nenhuma dependencia nova.

## Alteracoes

### 1. `src/components/students/StudentFormDialog.tsx`

Adicionar as props `captionLayout="dropdown-buttons"`, `fromYear={1920}` e `toYear={new Date().getFullYear()}` ao componente `<Calendar>` do campo Data de Nascimento. Isso substitui o label "February 2026" por dois selects (mes + ano) com setas de navegacao.

### 2. `src/components/ui/calendar.tsx`

Adicionar estilos para os novos elementos de dropdown que aparecem no cabecalho:
- `caption_dropdowns`: layout flex para os selects de mes/ano
- `vhidden`: classe para o label acessivel oculto visualmente

Esses estilos garantem que os dropdowns fiquem alinhados e com aparencia consistente com o design system.

---

### Secao tecnica

No `StudentFormDialog.tsx`, a linha do Calendar muda de:

```text
<Calendar mode="single" selected={field.value} onSelect={field.onChange}
  disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
  initialFocus className="p-3 pointer-events-auto" />
```

Para:

```text
<Calendar mode="single" selected={field.value} onSelect={field.onChange}
  captionLayout="dropdown-buttons"
  fromYear={1920} toYear={new Date().getFullYear()}
  disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
  initialFocus className="p-3 pointer-events-auto" />
```

No `calendar.tsx`, adicionar nas classNames:

```text
caption_dropdowns: "flex gap-1 items-center"
vhidden: "hidden"
```

Resultado: dois selects nativos (mes e ano) no cabecalho do calendario, permitindo saltar diretamente para qualquer ano.

