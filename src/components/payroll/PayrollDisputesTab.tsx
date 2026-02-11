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
import { Textarea } from "@/components/ui/textarea";
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
  usePayrollDisputes,
  useCreatePayrollDispute,
  useResolvePayrollDispute,
} from "@/hooks/usePayrollDisputes";
import { usePayableSessions } from "@/hooks/usePayroll";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, CheckCircle, XCircle } from "lucide-react";

export function PayrollDisputesTab() {
  const { data: disputes = [], isLoading } = usePayrollDisputes({
    status: "open",
  });
  const { data: sessions = [] } = usePayableSessions({
    startDate: new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
  });

  const createDispute = useCreatePayrollDispute();
  const resolveDispute = useResolvePayrollDispute();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isResolveOpen, setIsResolveOpen] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    session_id: "",
    trainer_id: "",
    dispute_reason: "",
    dispute_detail: "",
  });
  const [resolutionData, setResolutionData] = useState({
    resolution: "",
    status: "resolved" as "resolved" | "rejected",
  });

  const handleCreateDispute = async () => {
    if (!formData.session_id || !formData.dispute_reason) return;

    const session = sessions.find((s) => s.id === formData.session_id);
    if (!session) return;

    await createDispute.mutateAsync({
      session_id: formData.session_id,
      trainer_id: session.trainer_id || "",
      dispute_reason: formData.dispute_reason,
      dispute_detail: formData.dispute_detail || null,
      status: "open",
    });

    setFormData({
      session_id: "",
      trainer_id: "",
      dispute_reason: "",
      dispute_detail: "",
    });
    setIsCreateOpen(false);
  };

  const handleResolveDispute = async () => {
    if (!isResolveOpen || !resolutionData.resolution) return;

    await resolveDispute.mutateAsync({
      disputeId: isResolveOpen,
      resolution: resolutionData.resolution,
      status: resolutionData.status,
    });

    setIsResolveOpen(null);
    setResolutionData({ resolution: "", status: "resolved" });
  };

  const statusColor = {
    open: "bg-red-100 text-red-800",
    resolved: "bg-green-100 text-green-800",
    rejected: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Disputas de Pagamento</h2>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Nova Disputa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Nova Disputa</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="session_id">Sessão</Label>
                <Select
                  value={formData.session_id}
                  onValueChange={(value) => {
                    const session = sessions.find((s) => s.id === value);
                    setFormData({
                      ...formData,
                      session_id: value,
                      trainer_id: session?.trainer_id || "",
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma sessão" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((session) => (
                      <SelectItem key={session.id} value={session.id}>
                        {session.trainer_name} -{" "}
                        {format(new Date(session.session_date), "dd/MM/yyyy")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dispute_reason">Motivo da Disputa</Label>
                <Select
                  value={formData.dispute_reason}
                  onValueChange={(value) =>
                    setFormData({ ...formData, dispute_reason: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="valor_incorreto">
                      Valor Incorreto
                    </SelectItem>
                    <SelectItem value="sessao_nao_realizada">
                      Sessão Não Realizada
                    </SelectItem>
                    <SelectItem value="duracao_diferente">
                      Duração Diferente
                    </SelectItem>
                    <SelectItem value="taxa_incorreta">
                      Taxa Incorreta
                    </SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dispute_detail">Detalhes</Label>
                <Textarea
                  id="dispute_detail"
                  placeholder="Descreva os detalhes da disputa..."
                  value={formData.dispute_detail}
                  onChange={(e) =>
                    setFormData({ ...formData, dispute_detail: e.target.value })
                  }
                />
              </div>
              <Button
                onClick={handleCreateDispute}
                disabled={createDispute.isPending}
                className="w-full"
              >
                {createDispute.isPending ? "Registrando..." : "Registrar Disputa"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          Carregando disputas...
        </div>
      ) : disputes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Nenhuma disputa aberta.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Treinador</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {disputes.map((dispute) => (
                <TableRow key={dispute.id}>
                  <TableCell className="font-medium">
                    {dispute.trainer_name}
                  </TableCell>
                  <TableCell className="text-sm">
                    {dispute.dispute_reason.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {dispute.session_date
                      ? format(new Date(dispute.session_date), "dd/MM/yyyy", {
                          locale: ptBR,
                        })
                      : "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {dispute.payment_amount_cents
                      ? `R$ ${(dispute.payment_amount_cents / 100).toFixed(2)}`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        statusColor[
                          dispute.status as keyof typeof statusColor
                        ]
                      }
                    >
                      {dispute.status === "open"
                        ? "Aberta"
                        : dispute.status === "resolved"
                          ? "Resolvida"
                          : "Rejeitada"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {dispute.status === "open" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsResolveOpen(dispute.id)}
                      >
                        Resolver
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!isResolveOpen} onOpenChange={(open) => !open && setIsResolveOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver Disputa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="resolution">Resolução</Label>
              <Textarea
                id="resolution"
                placeholder="Explique como a disputa foi resolvida..."
                value={resolutionData.resolution}
                onChange={(e) =>
                  setResolutionData({
                    ...resolutionData,
                    resolution: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="status">Resultado</Label>
              <Select
                value={resolutionData.status}
                onValueChange={(value) =>
                  setResolutionData({
                    ...resolutionData,
                    status: value as "resolved" | "rejected",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resolved">Resolvida Favorável</SelectItem>
                  <SelectItem value="rejected">Rejeitada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsResolveOpen(null)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleResolveDispute}
                disabled={resolveDispute.isPending}
                className="flex-1"
              >
                {resolveDispute.isPending ? "Resolvendo..." : "Resolver"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
