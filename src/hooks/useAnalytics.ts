import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  startOfMonth, endOfMonth, subMonths, format, differenceInDays, parseISO,
} from "date-fns";

/* ---------- types ---------- */
export interface DateRange {
  from: Date;
  to: Date;
}

export interface ConversionFunnel {
  totalLeads: number;
  trialScheduled: number;
  converted: number;
  lost: number;
  avgConversionDays: number | null;
  bySource: { source: string; count: number; converted: number }[];
}

export interface OperationsMetrics {
  totalSessions: number;
  completedSessions: number;
  cancelledOnTime: number;
  cancelledLate: number;
  noShows: number;
  occupancyRate: number;
  heatmap: { day: number; hour: number; count: number }[];
}

export interface FinancialMetrics {
  mrr: number;
  revenue: number[];
  revenueLabels: string[];
  churnRate: number;
  avgTicket: number;
  overdueRate: number;
  expensesByCategory: { name: string; amount: number; color: string }[];
}

/* ---------- conversion ---------- */
export function useConversionAnalytics(range: DateRange) {
  return useQuery({
    queryKey: ["analytics-conversion", format(range.from, "yyyy-MM-dd"), format(range.to, "yyyy-MM-dd")],
    queryFn: async (): Promise<ConversionFunnel> => {
      const from = format(range.from, "yyyy-MM-dd");
      const to = format(range.to, "yyyy-MM-dd");

      const { data: leads, error } = await supabase
        .from("leads")
        .select("id, status, source, trial_date, created_at, converted_to_student_id")
        .gte("created_at", from + "T00:00:00")
        .lte("created_at", to + "T23:59:59");
      if (error) throw error;

      const all = leads ?? [];
      const totalLeads = all.length;
      const trialScheduled = all.filter((l) => l.trial_date).length;
      const converted = all.filter((l) => l.status === "converted").length;
      const lost = all.filter((l) => l.status === "lost").length;

      // avg conversion days
      const convertedLeads = all.filter((l) => l.status === "converted" && l.converted_to_student_id);
      let avgConversionDays: number | null = null;
      if (convertedLeads.length > 0) {
        // get student created_at for converted leads
        const studentIds = convertedLeads.map((l) => l.converted_to_student_id!);
        const { data: students } = await supabase
          .from("students")
          .select("id, created_at")
          .in("id", studentIds);
        const studentMap = new Map((students ?? []).map((s) => [s.id, s.created_at]));
        let totalDays = 0;
        let count = 0;
        for (const l of convertedLeads) {
          const sDate = studentMap.get(l.converted_to_student_id!);
          if (sDate) {
            totalDays += differenceInDays(parseISO(sDate), parseISO(l.created_at));
            count++;
          }
        }
        avgConversionDays = count > 0 ? Math.round(totalDays / count) : null;
      }

      // by source
      const sourceMap = new Map<string, { count: number; converted: number }>();
      for (const l of all) {
        const src = l.source || "Direto";
        if (!sourceMap.has(src)) sourceMap.set(src, { count: 0, converted: 0 });
        const entry = sourceMap.get(src)!;
        entry.count++;
        if (l.status === "converted") entry.converted++;
      }
      const bySource = Array.from(sourceMap.entries())
        .map(([source, v]) => ({ source, ...v }))
        .sort((a, b) => b.count - a.count);

      return { totalLeads, trialScheduled, converted, lost, avgConversionDays, bySource };
    },
    staleTime: 120_000,
  });
}

/* ---------- operations ---------- */
export function useOperationsAnalytics(range: DateRange) {
  return useQuery({
    queryKey: ["analytics-operations", format(range.from, "yyyy-MM-dd"), format(range.to, "yyyy-MM-dd")],
    queryFn: async (): Promise<OperationsMetrics> => {
      const from = format(range.from, "yyyy-MM-dd");
      const to = format(range.to, "yyyy-MM-dd");

      const { data: sessions, error } = await supabase
        .from("sessions")
        .select("id, session_date, start_time, status, capacity")
        .gte("session_date", from)
        .lte("session_date", to);
      if (error) throw error;

      const all = sessions ?? [];
      const totalSessions = all.length;
      const completedSessions = all.filter((s) => s.status === "completed").length;
      const cancelledOnTime = all.filter((s) => s.status === "cancelled_on_time").length;
      const cancelledLate = all.filter((s) => s.status === "cancelled_late").length;
      const noShows = all.filter((s) => s.status === "no_show").length;

      // occupancy for completed/scheduled
      const scheduledOrCompleted = all.filter((s) => ["scheduled", "completed"].includes(s.status));
      const totalCapacity = scheduledOrCompleted.reduce((sum, s) => sum + s.capacity, 0);

      // get bookings for these sessions
      let totalBooked = 0;
      if (scheduledOrCompleted.length > 0) {
        // Also check class_sessions bookings
        const sessionIds = scheduledOrCompleted.map((s) => s.id);
        // sessions table doesn't have bookings, it's 1:1 student
        totalBooked = scheduledOrCompleted.filter((s) => s.status === "completed").length;
      }

      const occupancyRate = totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 100) : 0;

      // heatmap: day_of_week x hour
      const heatmap: { day: number; hour: number; count: number }[] = [];
      const heatmapMap = new Map<string, number>();
      for (const s of all) {
        const d = parseISO(s.session_date);
        const day = d.getDay(); // 0=Sun
        const hour = parseInt(s.start_time.split(":")[0], 10);
        const key = `${day}-${hour}`;
        heatmapMap.set(key, (heatmapMap.get(key) ?? 0) + 1);
      }
      for (const [key, count] of heatmapMap) {
        const [day, hour] = key.split("-").map(Number);
        heatmap.push({ day, hour, count });
      }

      return { totalSessions, completedSessions, cancelledOnTime, cancelledLate, noShows, occupancyRate, heatmap };
    },
    staleTime: 120_000,
  });
}

/* ---------- financial ---------- */
export function useFinancialAnalytics(range: DateRange) {
  return useQuery({
    queryKey: ["analytics-financial", format(range.from, "yyyy-MM-dd"), format(range.to, "yyyy-MM-dd")],
    queryFn: async (): Promise<FinancialMetrics> => {
      const from = range.from;
      const to = range.to;

      // Monthly revenue for the period (paid invoices)
      const { data: paidInvoices } = await supabase
        .from("invoices")
        .select("paid_amount_cents, payment_date")
        .eq("status", "paid")
        .gte("payment_date", format(from, "yyyy-MM-dd"))
        .lte("payment_date", format(to, "yyyy-MM-dd"));

      // group by month
      const monthlyMap = new Map<string, number>();
      for (const inv of paidInvoices ?? []) {
        if (!inv.payment_date) continue;
        const m = inv.payment_date.substring(0, 7); // yyyy-MM
        monthlyMap.set(m, (monthlyMap.get(m) ?? 0) + (inv.paid_amount_cents ?? 0));
      }
      const sortedMonths = Array.from(monthlyMap.keys()).sort();
      const revenue = sortedMonths.map((m) => monthlyMap.get(m)! / 100);
      const revenueLabels = sortedMonths.map((m) => {
        const [y, mo] = m.split("-");
        return `${mo}/${y.substring(2)}`;
      });

      // MRR: active contracts monthly_value_cents
      const { data: contracts } = await supabase
        .from("contracts")
        .select("monthly_value_cents")
        .eq("status", "active");
      const mrr = (contracts ?? []).reduce((sum, c) => sum + (c.monthly_value_cents ?? 0), 0);

      // Churn: cancelled contracts this month vs total active start of month
      const now = new Date();
      const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");

      const { count: cancelledCount } = await supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("status", "cancelled")
        .gte("cancelled_at", monthStart)
        .lte("cancelled_at", monthEnd + "T23:59:59");

      const { count: activeCount } = await supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");

      const totalBase = (activeCount ?? 0) + (cancelledCount ?? 0);
      const churnRate = totalBase > 0 ? Math.round(((cancelledCount ?? 0) / totalBase) * 100) : 0;

      // Avg ticket
      const totalPaid = (paidInvoices ?? []).reduce((s, i) => s + (i.paid_amount_cents ?? 0), 0);
      const avgTicket = (paidInvoices ?? []).length > 0 ? totalPaid / (paidInvoices ?? []).length : 0;

      // Overdue rate
      const { count: overdueCount } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("status", "overdue");
      const { count: totalInvoices } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "paid", "overdue"]);
      const overdueRate = (totalInvoices ?? 0) > 0
        ? Math.round(((overdueCount ?? 0) / (totalInvoices ?? 0)) * 100)
        : 0;

      // Expenses by category
      const { data: expenses } = await supabase
        .from("expenses")
        .select("amount_cents, category_id")
        .gte("due_date", format(from, "yyyy-MM-dd"))
        .lte("due_date", format(to, "yyyy-MM-dd"));

      const { data: categories } = await supabase
        .from("expense_categories")
        .select("id, name, color");

      const catMap = new Map((categories ?? []).map((c) => [c.id, { name: c.name, color: c.color }]));
      const expByCat = new Map<string, number>();
      for (const e of expenses ?? []) {
        const catName = catMap.get(e.category_id)?.name ?? "Outros";
        expByCat.set(catName, (expByCat.get(catName) ?? 0) + e.amount_cents);
      }
      const expensesByCategory = Array.from(expByCat.entries())
        .map(([name, amount]) => {
          const cat = [...(categories ?? [])].find((c) => c.name === name);
          return { name, amount: amount / 100, color: cat?.color ?? "gray" };
        })
        .sort((a, b) => b.amount - a.amount);

      return { mrr, revenue, revenueLabels, churnRate, avgTicket, overdueRate, expensesByCategory };
    },
    staleTime: 120_000,
  });
}
