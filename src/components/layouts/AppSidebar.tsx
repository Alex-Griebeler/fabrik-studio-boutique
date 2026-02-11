import {
  LayoutDashboard,
  Users,
  UserPlus,
  DollarSign,
  Receipt,
  CalendarDays,
  BarChart3,
  TrendingUp,
  Settings,
  LogOut,
  Package,
  GraduationCap,
  Landmark,
  Banknote,
  Percent,
  ListTodo,
  ClipboardList,
  Smartphone,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import logoFabrik from "@/assets/logo-fabrik.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
];

const managementItems = [
  { title: "Alunos", url: "/students", icon: Users },
  { title: "Leads", url: "/leads", icon: UserPlus },
  { title: "Tarefas", url: "/tasks", icon: ListTodo },
  { title: "Planos", url: "/plans", icon: Package },
];

const financeItems = [
  { title: "Financeiro", url: "/finance", icon: DollarSign },
  { title: "Despesas", url: "/expenses", icon: Receipt },
  { title: "Comissões", url: "/commissions", icon: Percent },
  { title: "Folha Pagto", url: "/payroll", icon: Banknote },
  { title: "Minha Folha", url: "/trainer/payroll", icon: ClipboardList },
  { title: "Conciliação", url: "/bank-reconciliation", icon: Landmark },
];

const operationalItems = [
  { title: "Agenda", url: "/schedule", icon: CalendarDays },
  { title: "Instrutores", url: "/instructors", icon: GraduationCap },
  { title: "Trainer App", url: "/trainer-app", icon: Smartphone },
  { title: "Student App", url: "/student-app", icon: Users },
  { title: "Analytics", url: "/analytics", icon: TrendingUp },
  { title: "Relatórios", url: "/reports", icon: BarChart3 },
];

const settingsItems = [
  { title: "Configurações", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();

  const renderItems = (items: typeof mainItems) =>
    items.map((item) => (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild>
          <NavLink
            to={item.url}
            className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-sidebar-accent"
            activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="text-sm">{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <div className="flex h-16 items-center justify-center border-b border-sidebar-border px-4">
        <img
          src={logoFabrik}
          alt="Fabrik"
          className={collapsed ? "h-7 w-auto" : "h-9 w-auto"}
        />
      </div>

      <SidebarContent className="px-2 pt-4">
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Principal</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(mainItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Gestão</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(managementItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Financeiro</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(financeItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Operacional</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(operationalItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Sistema</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(settingsItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={signOut}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="text-sm">Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
