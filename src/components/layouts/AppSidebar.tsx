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
  Zap,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRoles, type AppRole } from "@/hooks/useUserRoles";
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

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: AppRole[];
}

const mainItems: MenuItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["admin", "manager", "reception"] },
];

const managementItems: MenuItem[] = [
  { title: "Alunos", url: "/students", icon: Users, roles: ["admin", "manager", "reception"] as AppRole[] },
  { title: "Leads", url: "/leads", icon: UserPlus, roles: ["admin", "manager", "reception"] as AppRole[] },
  { title: "Tarefas", url: "/tasks", icon: ListTodo, roles: ["admin", "manager", "reception"] as AppRole[] },
  { title: "Planos", url: "/plans", icon: Package, roles: ["admin", "manager"] as AppRole[] },
];

const financeItems: MenuItem[] = [
  { title: "Financeiro", url: "/finance", icon: DollarSign, roles: ["admin", "manager"] },
  { title: "Despesas", url: "/expenses", icon: Receipt, roles: ["admin"] },
  { title: "Comissões", url: "/commissions", icon: Percent, roles: ["admin", "manager"] },
  { title: "Folha Pagto", url: "/payroll", icon: Banknote, roles: ["admin", "manager"] },
  { title: "Minha Folha", url: "/trainer/payroll", icon: ClipboardList, roles: ["admin", "instructor"] },
  { title: "Conciliação", url: "/bank-reconciliation", icon: Landmark, roles: ["admin", "manager"] },
];

const operationalItems: MenuItem[] = [
  { title: "Agenda", url: "/schedule", icon: CalendarDays, roles: ["admin", "manager", "instructor", "reception"] },
  { title: "Instrutores", url: "/instructors", icon: GraduationCap, roles: ["admin", "manager"] },
  { title: "Trainer App", url: "/trainer-app", icon: Smartphone, roles: ["admin", "instructor"] },
  { title: "Student App", url: "/student-app", icon: Users, roles: ["admin", "student"] },
  { title: "Analytics", url: "/analytics", icon: TrendingUp, roles: ["admin", "manager"] },
  { title: "Relatórios", url: "/reports", icon: BarChart3, roles: ["admin", "manager"] },
  { title: "Marketing IA", url: "/marketing-ai", icon: Zap, roles: ["admin", "reception"] },
];

const settingsItems: MenuItem[] = [
  { title: "Configurações", url: "/settings", icon: Settings, roles: ["admin"] },
];


export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();
  const { hasAnyRole } = useUserRoles();

  const renderItems = (items: MenuItem[]) =>
    items
      .filter((item) => !item.roles || hasAnyRole(item.roles))
      .map((item) => (
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

  const hasAnyInGroup = (items: MenuItem[]) =>
    items.some((item) => !item.roles || hasAnyRole(item.roles));

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
        {hasAnyInGroup(mainItems) && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Principal</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(mainItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {hasAnyInGroup(managementItems) && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Gestão</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(managementItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {hasAnyInGroup(financeItems) && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Financeiro</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(financeItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {hasAnyInGroup(operationalItems) && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Operacional</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(operationalItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {hasAnyInGroup(settingsItems) && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Sistema</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(settingsItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
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
