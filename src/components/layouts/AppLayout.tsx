import { useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SeoHead } from "@/components/SeoHead";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";

/**
 * Título e descrição por rota interna. Todas as rotas autenticadas são
 * marcadas como noindex — são telas de gestão, não conteúdo público.
 */
const ROUTE_META: Record<string, { title: string; description: string }> = {
  "/dashboard": {
    title: "Painel do studio",
    description: "Visão geral do studio: ocupação das aulas, alunos ativos, tarefas do dia e indicadores financeiros.",
  },
  "/students": {
    title: "Alunos",
    description: "Cadastro e acompanhamento dos alunos do studio, com contratos, saúde e histórico de presença.",
  },
  "/plans": {
    title: "Planos",
    description: "Catálogo de planos e preços do studio, por categoria, duração e frequência semanal.",
  },
  "/leads": {
    title: "Leads e CRM",
    description: "Funil comercial do studio: captação de leads, aulas experimentais e conversão em alunos.",
  },
  "/finance": {
    title: "Financeiro",
    description: "Contratos, faturas, recebimentos e notas fiscais do studio em um único painel financeiro.",
  },
  "/bank-reconciliation": {
    title: "Conciliação bancária",
    description: "Importação de extratos e conciliação automática de transações com faturas e despesas.",
  },
  "/expenses": {
    title: "Despesas",
    description: "Controle de despesas do studio por categoria, fornecedor e status de pagamento.",
  },
  "/instructors": {
    title: "Treinadores",
    description: "Cadastro de treinadores, modelos de remuneração, dados bancários e disponibilidade.",
  },
  "/schedule": {
    title: "Agenda",
    description: "Agenda de aulas do studio com check-in, lista de espera e gestão de sessões recorrentes.",
  },
  "/reports": {
    title: "Relatórios",
    description: "Relatórios operacionais e financeiros do studio, com filtros por período e modalidade.",
  },
  "/settings": {
    title: "Configurações",
    description: "Regras de negócio do studio: prazos de cancelamento, créditos de reposição e políticas internas.",
  },
  "/payroll": {
    title: "Folha de pagamento",
    description: "Ciclos de pagamento dos treinadores, sessões computadas e contestações em aberto.",
  },
  "/analytics": {
    title: "Analytics",
    description: "Análises de conversão, operação e resultado financeiro do studio, com projeções mensais.",
  },
  "/commissions": {
    title: "Comissões",
    description: "Comissões de vendas, renovações e indicações, com acompanhamento de metas mensais.",
  },
  "/tasks": {
    title: "Tarefas",
    description: "Tarefas da equipe: primeiro contato, resgate de leads e lembretes de aula experimental.",
  },
  "/trainer/payroll": {
    title: "Meus pagamentos",
    description: "Área do treinador para conferir sessões realizadas, valores a receber e contestações.",
  },
  "/marketing-ai": {
    title: "Marketing IA",
    description: "Atendimento por WhatsApp com agente de IA, sequências de nutrição e histórico de conversas.",
  },
  "/import": {
    title: "Importação de dados",
    description: "Importação de alunos e dados históricos para o sistema de gestão do studio.",
  },
  "/alertas-faltas": {
    title: "Alertas de faltas",
    description: "Alertas de risco de assiduidade dos alunos, com escalação e acompanhamento pela equipe.",
  },
  "/alertas-churn": {
    title: "Alertas de churn",
    description: "Alunos com risco de cancelamento, priorizados para ação de retenção da equipe.",
  },
};

const DEFAULT_META = {
  title: "Gestão do studio",
  description: "Área interna de gestão do Fabrik Body & Mind Fitness Studio.",
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const meta =
    ROUTE_META[pathname] ??
    ROUTE_META[Object.keys(ROUTE_META).find((route) => pathname.startsWith(`${route}/`)) ?? ""] ??
    DEFAULT_META;

  return (
    <SidebarProvider>
      <SeoHead title={meta.title} description={meta.description} path={pathname} noindex />
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <AppHeader />
          <main className="flex-1 p-4 lg:p-6 animate-fade-in">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
