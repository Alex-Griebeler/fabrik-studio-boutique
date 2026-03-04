import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";

export interface MonthlySnapshot {
  month: string;
  label: string;
  revenue: number;
  expenses: number;
  result: number;
  overdueCount: number;
  overdueAmount: number;
  paidCount: number;
}

export interface CashFlowProjection {
  month: string;
  label: string;
  expectedIn: number;
  expectedOut: number;
  projected: number;
}

export interface FinancialDashboardData {
  monthlySnapshots: MonthlySnapshot[];
  cashFlowProjection: CashFlowProjection[];
  currentMonth: {
    revenue: number;
    expenses: number;
    result: number;
    overdueCount: number;
    overdueAmount: number;
    pendingRevenue: number;
    revenueChange: number;
    expenseChange: number;
  };
}

export function useFinancialDashboard() {
  return useQuery({
    queryKey: ["financial-dashboard"],
    queryFn: async (): Promise<FinancialDashboardData> => {
      const now = new Date();
      const months = 6;
      const from = format(startOfMonth(subMonths(now, months - 1)), "yyyy-MM-dd");
      const to = format(endOfMonth(now), "yyyy-MM-dd");

      // Fetch paid invoices for the last 6 months
      const { data: paidInvoices } = await supabase
        .from("invoices")
        .select("paid_amount_cents, amount_cents, payment_date, status")
        .eq("status", "paid")
        .gte("payment_date", from)
        .lte("payment_date", to)
        .limit(1000);

      // Fetch overdue invoices
      const { data: overdueInvoices } = await supabase
        .from("invoices")
        .select("amount_cents, due_date, status")
        .eq("status", "overdue")
        .limit(1000);

      // Fetch paid expenses for the last 6 months
      const { data: paidExpenses } = await supabase
        .from("expenses")
        .select("amount_cents, payment_date, competence_date")
        .eq("status", "paid")
        .gte("payment_date", from)
        .lte("payment_date", to)
        .limit(1000);

      // Fetch pending invoices (future revenue)
      const { data: pendingInvoices } = await supabase
        .from("invoices")
        .select("amount_cents, due_date, status")
        .in("status", ["pending", "scheduled"])
        .limit(1000);

      // Fetch pending expenses (future costs)
      const { data: pendingExpenses } = await supabase
        .from("expenses")
        .select("amount_cents, due_date")
        .eq("status", "pending")
        .limit(1000);

      // Build monthly snapshots
      const snapshots: MonthlySnapshot[] = [];
      for (let i = months - 1; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const monthKey = format(monthDate, "yyyy-MM");
        const label = format(monthDate, "MMM/yy");

        const monthRevenue = (paidInvoices ?? [])
          .filter((inv) => inv.payment_date?.startsWith(monthKey))
          .reduce((sum, inv) => sum + (inv.paid_amount_cents ?? inv.amount_cents), 0);

        const monthExpenses = (paidExpenses ?? [])
          .filter((exp) => exp.payment_date?.startsWith(monthKey))
          .reduce((sum, exp) => sum + exp.amount_cents, 0);

        const monthOverdue = (overdueInvoices ?? [])
          .filter((inv) => inv.due_date?.startsWith(monthKey));

        snapshots.push({
          month: monthKey,
          label,
          revenue: monthRevenue / 100,
          expenses: monthExpenses / 100,
          result: (monthRevenue - monthExpenses) / 100,
          overdueCount: monthOverdue.length,
          overdueAmount: monthOverdue.reduce((s, i) => s + i.amount_cents, 0) / 100,
          paidCount: (paidInvoices ?? []).filter((inv) => inv.payment_date?.startsWith(monthKey)).length,
        });
      }

      // Cash flow projection (next 3 months)
      const projection: CashFlowProjection[] = [];
      for (let i = 1; i <= 3; i++) {
        const futureMonth = subMonths(now, -i);
        const monthKey = format(futureMonth, "yyyy-MM");
        const label = format(futureMonth, "MMM/yy");

        const expectedIn = (pendingInvoices ?? [])
          .filter((inv) => inv.due_date?.startsWith(monthKey))
          .reduce((sum, inv) => sum + inv.amount_cents, 0) / 100;

        const expectedOut = (pendingExpenses ?? [])
          .filter((exp) => exp.due_date?.startsWith(monthKey))
          .reduce((sum, exp) => sum + exp.amount_cents, 0) / 100;

        projection.push({
          month: monthKey,
          label,
          expectedIn,
          expectedOut,
          projected: expectedIn - expectedOut,
        });
      }

      // Current month metrics
      const currentKey = format(now, "yyyy-MM");
      const current = snapshots.find((s) => s.month === currentKey);
      const prevKey = format(subMonths(now, 1), "yyyy-MM");
      const prev = snapshots.find((s) => s.month === prevKey);

      const revenueChange = prev && prev.revenue > 0
        ? Math.round(((current?.revenue ?? 0) - prev.revenue) / prev.revenue * 100)
        : 0;
      const expenseChange = prev && prev.expenses > 0
        ? Math.round(((current?.expenses ?? 0) - prev.expenses) / prev.expenses * 100)
        : 0;

      const pendingRevenue = (pendingInvoices ?? [])
        .filter((inv) => inv.due_date?.startsWith(currentKey))
        .reduce((sum, inv) => sum + inv.amount_cents, 0) / 100;

      const totalOverdueCount = (overdueInvoices ?? []).length;
      const totalOverdueAmount = (overdueInvoices ?? []).reduce((s, i) => s + i.amount_cents, 0) / 100;

      return {
        monthlySnapshots: snapshots,
        cashFlowProjection: projection,
        currentMonth: {
          revenue: current?.revenue ?? 0,
          expenses: current?.expenses ?? 0,
          result: (current?.revenue ?? 0) - (current?.expenses ?? 0),
          overdueCount: totalOverdueCount,
          overdueAmount: totalOverdueAmount,
          pendingRevenue,
          revenueChange,
          expenseChange,
        },
      };
    },
    staleTime: 120_000,
  });
}
