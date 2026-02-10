import { useState, useMemo } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useInvoices } from "@/hooks/useInvoices";
import { useExpenses } from "@/hooks/useExpenses";
import { formatCents } from "@/hooks/usePlans";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

function monthKey(d: Date) {
  return format(d, "yyyy-MM");
}

function monthLabel(d: Date) {
  return format(d, "MMM/yy", { locale: ptBR });
}

export default function Reports() {
  const [tab, setTab] = useState("cashflow");
  const [range, setRange] = useState("6");

  const { data: invoices, isLoading: loadingInv } = useInvoices("all");
  const { data: expenses, isLoading: loadingExp } = useExpenses("all");

  const months = useMemo(() => {
    const n = parseInt(range);
    const end = new Date();
    const start = subMonths(startOfMonth(end), n - 1);
    return eachMonthOfInterval({ start, end: endOfMonth(end) });
  }, [range]);

  // Aggregate data by month
  const monthlyData = useMemo(() => {
    return months.map((m) => {
      const key = monthKey(m);
      const label = monthLabel(m);

      const monthInvoices = invoices?.filter((i) => {
        if (i.status === "cancelled") return false;
        const pd = i.payment_date || i.due_date;
        return pd?.startsWith(key);
      }) ?? [];

      const monthExpenses = expenses?.filter((e) => {
        if (e.status === "cancelled") return false;
        const pd = e.payment_date || e.due_date;
        return pd?.startsWith(key);
      }) ?? [];

      const receitas = monthInvoices
        .filter((i) => i.status === "paid")
        .reduce((s, i) => s + (i.paid_amount_cents || i.amount_cents), 0);

      const receitasPrevistas = monthInvoices.reduce((s, i) => s + i.amount_cents, 0);

      const despesas = monthExpenses
        .filter((e) => e.status === "paid")
        .reduce((s, e) => s + e.amount_cents, 0);

      const despesasPrevistas = monthExpenses.reduce((s, e) => s + e.amount_cents, 0);

      return {
        month: label,
        key,
        receitas: receitas / 100,
        despesas: despesas / 100,
        saldo: (receitas - despesas) / 100,
        receitasPrevistas: receitasPrevistas / 100,
        despesasPrevistas: despesasPrevistas / 100,
        receitasCents: receitas,
        despesasCents: despesas,
        receitasPrevistasCents: receitasPrevistas,
        despesasPrevistasCents: despesasPrevistas,
      };
    });
  }, [months, invoices, expenses]);

  // DRE summary (all months combined)
  const dre = useMemo(() => {
    const totalReceitas = monthlyData.reduce((s, m) => s + m.receitasCents, 0);
    const totalDespesas = monthlyData.reduce((s, m) => s + m.despesasCents, 0);

    // Group expenses by category
    const paidExpenses = expenses?.filter((e) => {
      if (e.status !== "paid") return false;
      const pd = e.payment_date || e.due_date;
      const firstMonth = monthKey(months[0]);
      const lastMonth = monthKey(months[months.length - 1]);
      return pd && pd >= firstMonth && pd <= lastMonth + "-31";
    }) ?? [];

    const byCategory = new Map<string, number>();
    paidExpenses.forEach((e) => {
      const cat = e.category?.name || "Outros";
      byCategory.set(cat, (byCategory.get(cat) || 0) + e.amount_cents);
    });

    const categorizedExpenses = Array.from(byCategory.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);

    return {
      totalReceitas,
      totalDespesas,
      resultado: totalReceitas - totalDespesas,
      categorizedExpenses,
    };
  }, [monthlyData, expenses, months]);

  const isLoading = loadingInv || loadingExp;

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Fluxo de caixa, DRE e análises financeiras"
        actions={
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Últimos 3 meses</SelectItem>
              <SelectItem value="6">Últimos 6 meses</SelectItem>
              <SelectItem value="12">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="cashflow">Fluxo de Caixa</TabsTrigger>
          <TabsTrigger value="dre">DRE</TabsTrigger>
        </TabsList>

        {/* CASH FLOW */}
        <TabsContent value="cashflow" className="space-y-6">
          {isLoading ? (
            <Skeleton className="h-[350px] w-full" />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receitas vs Despesas</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis
                      className="text-xs"
                      tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                    />
                    <Tooltip
                      formatter={(value: number) => formatCents(Math.round(value * 100))}
                      contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    />
                    <Legend />
                    <Bar dataKey="receitas" name="Receitas" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesas" name="Despesas" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Monthly breakdown table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalhamento Mensal</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Receitas</TableHead>
                    <TableHead className="text-right">Despesas</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyData.map((m) => (
                    <TableRow key={m.key}>
                      <TableCell className="font-medium capitalize">{m.month}</TableCell>
                      <TableCell className="text-right text-green-600 dark:text-green-400">{formatCents(m.receitasCents)}</TableCell>
                      <TableCell className="text-right text-red-600 dark:text-red-400">{formatCents(m.despesasCents)}</TableCell>
                      <TableCell className={`text-right font-semibold ${m.saldo >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {formatCents(m.receitasCents - m.despesasCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DRE */}
        <TabsContent value="dre" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Demonstrativo de Resultado — Período Selecionado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <Table>
                  <TableBody>
                    {/* Revenue */}
                    <TableRow className="bg-muted/30">
                      <TableCell className="font-semibold" colSpan={2}>RECEITAS</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="pl-6">Receitas de Mensalidades</TableCell>
                      <TableCell className="text-right font-medium text-green-600 dark:text-green-400">
                        {formatCents(dre.totalReceitas)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-t-2">
                      <TableCell className="font-semibold pl-4">Total Receitas</TableCell>
                      <TableCell className="text-right font-bold text-green-600 dark:text-green-400">
                        {formatCents(dre.totalReceitas)}
                      </TableCell>
                    </TableRow>

                    {/* Expenses */}
                    <TableRow className="bg-muted/30">
                      <TableCell className="font-semibold" colSpan={2}>DESPESAS</TableCell>
                    </TableRow>
                    {dre.categorizedExpenses.map((c) => (
                      <TableRow key={c.name}>
                        <TableCell className="pl-6">{c.name}</TableCell>
                        <TableCell className="text-right text-red-600 dark:text-red-400">
                          {formatCents(c.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {dre.categorizedExpenses.length === 0 && (
                      <TableRow>
                        <TableCell className="pl-6 text-muted-foreground" colSpan={2}>Sem despesas no período</TableCell>
                      </TableRow>
                    )}
                    <TableRow className="border-t-2">
                      <TableCell className="font-semibold pl-4">Total Despesas</TableCell>
                      <TableCell className="text-right font-bold text-red-600 dark:text-red-400">
                        {formatCents(dre.totalDespesas)}
                      </TableCell>
                    </TableRow>

                    {/* Result */}
                    <TableRow className="bg-muted/50 border-t-4">
                      <TableCell className="font-bold text-base">RESULTADO</TableCell>
                      <TableCell className={`text-right font-bold text-base ${dre.resultado >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {formatCents(dre.resultado)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
