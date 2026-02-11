import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useContracts, contractStatusLabels, paymentMethodLabels, type Contract } from "@/hooks/useContracts";
import { formatCents } from "@/hooks/usePlans";
import { ContractFormDialog } from "@/components/finance/ContractFormDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Database } from "@/integrations/supabase/types";

type ContractStatus = Database["public"]["Enums"]["contract_status"];

const contractStatusColors: Record<ContractStatus, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  suspended: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  expired: "bg-muted text-muted-foreground",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR });
}

interface Props {
  contracts: Contract[] | undefined;
  isLoading: boolean;
  onEdit: (contract: Contract) => void;
  onNew: () => void;
}

export function ContractsTab({ contracts, isLoading, onEdit, onNew }: Props) {
  const [statusFilter, setStatusFilter] = useState<"all" | ContractStatus>("all");
  const [search, setSearch] = useState("");

  const filtered = contracts?.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (search.trim() && !c.student?.full_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por aluno..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | ContractStatus)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="suspended">Suspensos</SelectItem>
              <SelectItem value="cancelled">Cancelados</SelectItem>
              <SelectItem value="expired">Expirados</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={onNew}>
          <Plus className="h-4 w-4 mr-1" /> Novo Contrato
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Aluno</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Valor Mensal</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              ))
            ) : !filtered?.length ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum contrato encontrado</TableCell></TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.student?.full_name || "—"}</TableCell>
                  <TableCell>{c.plan?.name || "—"}</TableCell>
                  <TableCell>{formatDate(c.start_date)}</TableCell>
                  <TableCell>{c.monthly_value_cents ? formatCents(c.monthly_value_cents) : "—"}</TableCell>
                  <TableCell>{c.payment_method ? paymentMethodLabels[c.payment_method] : "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={contractStatusColors[c.status]}>
                      {contractStatusLabels[c.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => onEdit(c)}>
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
