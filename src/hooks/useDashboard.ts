import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, subMonths, format, addDays } from "date-fns";

interface DashboardKPIs {
  revenue: { current: number; previous: number };
  activeStudents: { current: number; previous: number };
  overdue: { amount: number; count: number; totalInvoiced: number };
  occupancy: { rate: number; totalSlots: number; totalBooked: number };
}

interface UpcomingDue {
  id: string;
  student_name: string;
  amount_cents: number;
  due_date: string;
  status: string;
}

interface RecentLead {
  id: string;
  full_name: string;
  lead_stage: string | null;
  lead_source: string | null;
  created_at: string;
  phone: string | null;
}

export function useDashboardKPIs() {
  return useQuery({
    queryKey: ["dashboard-kpis"],
    queryFn: async (): Promise<DashboardKPIs> => {
      const now = new Date();
      const currentMonthStart = format(startOfMonth(now), "yyyy-MM-dd");
      const currentMonthEnd = format(endOfMonth(now), "yyyy-MM-dd");
      const prevMonth = subMonths(now, 1);
      const prevMonthStart = format(startOfMonth(prevMonth), "yyyy-MM-dd");
      const prevMonthEnd = format(endOfMonth(prevMonth), "yyyy-MM-dd");

      // Parallel queries
      const [
        currentRevenue,
        prevRevenue,
        currentStudents,
        prevStudents,
        overdueInvoices,
        totalInvoiced,
        sessionsThisMonth,
      ] = await Promise.all([
        // Revenue this month (paid invoices)
        supabase
          .from("invoices")
          .select("paid_amount_cents")
          .eq("status", "paid")
          .gte("payment_date", currentMonthStart)
          .lte("payment_date", currentMonthEnd),

        // Revenue last month
        supabase
          .from("invoices")
          .select("paid_amount_cents")
          .eq("status", "paid")
          .gte("payment_date", prevMonthStart)
          .lte("payment_date", prevMonthEnd),

        // Active students now
        supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),

        // Active students last month (approximate: created before end of prev month and active)
        supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .lte("created_at", prevMonthEnd + "T23:59:59"),

        // Overdue invoices
        supabase
          .from("invoices")
           .select("amount_cents")
           .eq("status", "overdue")
           .limit(1000),

        // Total invoiced this month (for overdue %)
        supabase
          .from("invoices")
           .select("amount_cents")
           .gte("due_date", currentMonthStart)
           .lte("due_date", currentMonthEnd)
           .limit(1000),

        // Sessions this month with bookings for occupancy
        // Include both scheduled and completed sessions for more accurate occupancy
        supabase
          .from("class_sessions")
          .select("capacity, id")
          .gte("session_date", currentMonthStart)
          .lte("session_date", currentMonthEnd)
          .in("status", ["scheduled", "completed"])
          .limit(2000),
      ]);

      // Calculate revenue
      const currentRevTotal = (currentRevenue.data ?? []).reduce(
        (sum, inv) => sum + (inv.paid_amount_cents ?? 0),
        0
      );
      const prevRevTotal = (prevRevenue.data ?? []).reduce(
        (sum, inv) => sum + (inv.paid_amount_cents ?? 0),
        0
      );

      // Overdue
      const overdueAmount = (overdueInvoices.data ?? []).reduce(
        (sum, inv) => sum + inv.amount_cents,
        0
      );
      const totalInvoicedAmount = (totalInvoiced.data ?? []).reduce(
        (sum, inv) => sum + inv.amount_cents,
        0
      );

      // Occupancy: get booking counts for current month sessions
      const sessionIds = (sessionsThisMonth.data ?? []).map((s) => s.id);
      const totalCapacity = (sessionsThisMonth.data ?? []).reduce(
        (sum, s) => sum + s.capacity,
        0
      );

      let totalBooked = 0;
      if (sessionIds.length > 0) {
        const { count } = await supabase
          .from("class_bookings")
          .select("id", { count: "exact", head: true })
          .in("session_id", sessionIds)
          .eq("status", "confirmed");
        totalBooked = count ?? 0;
      }

      const occupancyRate = totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 100) : 0;

      return {
        revenue: { current: currentRevTotal, previous: prevRevTotal },
        activeStudents: {
          current: currentStudents.count ?? 0,
          previous: prevStudents.count ?? 0,
        },
        overdue: {
          amount: overdueAmount,
          count: (overdueInvoices.data ?? []).length,
          totalInvoiced: totalInvoicedAmount,
        },
        occupancy: {
          rate: occupancyRate,
          totalSlots: totalCapacity,
          totalBooked,
        },
      };
    },
    staleTime: 60_000, // 1 min
  });
}

export function useUpcomingDues() {
  return useQuery({
    queryKey: ["dashboard-upcoming-dues"],
    queryFn: async (): Promise<UpcomingDue[]> => {
      const today = format(new Date(), "yyyy-MM-dd");
      const in7days = format(addDays(new Date(), 7), "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("invoices")
        .select("id, amount_cents, due_date, status, student:students(full_name)")
        .in("status", ["pending", "overdue"])
        .gte("due_date", today)
        .lte("due_date", in7days)
        .order("due_date", { ascending: true })
        .limit(10);

      if (error) throw error;

      return (data ?? []).map((inv: Record<string, unknown>) => ({
        id: inv.id as string,
        student_name: (inv.student as Record<string, string> | null)?.full_name ?? "—",
        amount_cents: inv.amount_cents as number,
        due_date: inv.due_date as string,
        status: inv.status as string,
      }));
    },
    staleTime: 60_000,
  });
}

export function useRecentLeads() {
  return useQuery({
    queryKey: ["dashboard-recent-leads"],
    queryFn: async (): Promise<RecentLead[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, status, source, created_at, phone")
        .eq("status", "new")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return (data ?? []).map(row => ({
        id: row.id,
        full_name: row.name,
        lead_stage: row.status,
        lead_source: row.source,
        created_at: row.created_at,
        phone: row.phone,
      })) as RecentLead[];
    },
    staleTime: 60_000,
  });
}
