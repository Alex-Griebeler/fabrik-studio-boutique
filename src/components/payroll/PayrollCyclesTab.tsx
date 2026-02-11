import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  usePayrollCycles,
  useCreatePayrollCycle,
  useClosePayrollCycle,
} from "@/hooks/usePayrollCycles";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Lock } from "lucide-react";

export function PayrollCyclesTab() {
  const { data: cycles = [], isLoading } = usePayrollCycles();
  const createCycle = useCreatePayrollCycle();
  const closeCycle = useClosePayrollCycle();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCycleToClose, setIsCycleToClose] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    competencia: "",
    start_date: "",
    end_date: "",
  });

  const handleCreateCycle = async () => {
    if (!formData.competencia || !formData.start_date || !formData.end_date) {
      return;
    }

    await createCycle.mutateAsync({
      competencia: new Date(formData.competencia).toISOString().split("T")[0],
      start_date: formData.start_date,
      end_date: formData.end_date,
      status: "open",
      created_by: "current-user-id", // TODO: get from auth context
    });

    setFormData({ competencia: "", start_date: "", end_date: "" });
    setIsCreateOpen(false);
  };

  const handleCloseCycle = async () => {
    if (isCycleToClose) {
      await closeCycle.mutateAsync(isCycleToClose);
      setIsCycleToClose(null);
    }
  };

  const statusColor = {
    open: "bg-blue-100 text-blue-800",
    closed: "bg-gray-100 text-gray-800",
    processing: "bg-yellow-100 text-yellow-800",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Ciclos de Folha de Pagamento</h2>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Novo Ciclo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo Ciclo de Folha</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="competencia">Mês/Ano (competência)</Label>
                <Input
                  id="competencia"
                  type="month"
                  value={formData.competencia}
                  onChange={(e) =>
                    setFormData({ ...formData, competencia: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="start_date">Data de Início</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) =>
                    setFormData({ ...formData, start_date: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="end_date">Data de Término</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) =>
                    setFormData({ ...formData, end_date: e.target.value })
                  }
                />
              </div>
              <Button
                onClick={handleCreateCycle}
                disabled={createCycle.isPending}
                className="w-full"
              >
                {createCycle.isPending ? "Criando..." : "Criar Ciclo"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          Carregando ciclos...
        </div>
      ) : cycles.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Nenhum ciclo de folha criado.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competência</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cycles.map((cycle) => (
                <TableRow key={cycle.id}>
                  <TableCell className="font-medium">
                    {format(new Date(cycle.competencia), "MMM/yyyy", {
                      locale: ptBR,
                    })}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(cycle.start_date), "dd/MM/yyyy")} a{" "}
                      {format(new Date(cycle.end_date), "dd/MM/yyyy")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColor[cycle.status as keyof typeof statusColor]}>
                      {cycle.status === "open"
                        ? "Aberto"
                        : cycle.status === "closed"
                          ? "Fechado"
                          : "Processando"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(cycle.created_at), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell>
                    {cycle.status === "open" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => setIsCycleToClose(cycle.id)}
                      >
                        <Lock className="w-4 h-4" />
                        Fechar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog
        open={!!isCycleToClose}
        onOpenChange={(open) => !open && setIsCycleToClose(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fechar Ciclo de Folha?</AlertDialogTitle>
            <AlertDialogDescription>
              Após fechar o ciclo, não será possível adicionar novos pagamentos.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCloseCycle}
              disabled={closeCycle.isPending}
            >
              {closeCycle.isPending ? "Fechando..." : "Fechar Ciclo"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
