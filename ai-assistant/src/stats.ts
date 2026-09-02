import { supabase } from "./supabaseClient.js";

export interface DashboardStats {
  activeMembers: number;
  incomeThisMonth: number;
  classesToday: number;
  paymentsThisMonth: number;
}

function currentMonthKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}-01`;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
  const monthKey = currentMonthKey();

  const [activeMembers, classesToday, invoicesThisMonth] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "client"),
    supabase
      .from("classes")
      .select("*", { count: "exact", head: true })
      .gte("start_time", todayStart)
      .lte("start_time", todayEnd),
    supabase.from("invoices").select("amount").eq("due_date", monthKey).eq("status", "pagada"),
  ]);

  const incomeThisMonth = (invoicesThisMonth.data ?? []).reduce(
    (sum, invoice) => sum + (invoice.amount ?? 0),
    0,
  );

  return {
    activeMembers: activeMembers.count ?? 0,
    incomeThisMonth,
    classesToday: classesToday.count ?? 0,
    paymentsThisMonth: (invoicesThisMonth.data ?? []).length,
  };
}
