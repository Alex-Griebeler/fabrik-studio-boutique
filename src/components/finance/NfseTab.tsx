import { useState } from "react";
import { Search, FileText, Download, RefreshCw, XCircle, ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useNfseList, useCancelNfse, useRetryNfse, nfseStatusLabels, nfseStatusColors, type Nfse } from "@/hooks/useNfse";
import { formatCents } from "@/hooks/usePlans";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return format(new Date(d), "dd/MM/yyyy", { locale: ptBR });
}

function fmtDateTime(d: string | null) {
  if (!d) return "—";
  return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR });
}

export function NfseTab() {
  const [statusFilter, setStatusFilter] = useState<"all" | Nfse["status"]>("all");
  const [search, setSearch] = useState("");
  const [cancelTarget, setCancelTarget] = useState<Nfse | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const { data: nfseList, isLoading } = useNfseList(statusFilter);
  const cancelNfse = useCancelNfse();
  const retryNfse = useRetryNfse();

  const filtered = nfseList?.filter((n) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      n.tomador_nome.toLowerCase().includes(q) ||
      (n.nfse_number ?? "").toLowerCase().includes(q) ||
      formatCents(n.amount_cents).includes(q)
    );
  });

  const handleCancel = () => {
    if (!cancelTarget) return;
    cancelNfse.mutate(
      { id: cancelTarget.id, reason: cancelReason },
      { onSuccess: () => { setCancelTarget(null); setCancelReason(""); } }
    );
  };

  const stats = {
    total: nfseList?.length ?? 0,
    authorized: nfseList?.filter((n) => n.status === "authorized").length ?? 0,
    pending: nfseList?.filter((n) => n.status === "pending" || n.status === "processing").length ?? 0,
    error: nfseList?.filter((n) => n.status === "error").length ?? 0,
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.authorized}</div>
          <div className="text-xs text-muted-foreground">Autorizadas</div>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.pending}</div>
          <div className="text-xs text-muted-foreground">Processando</div>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.error}</div>
          <div className="text-xs text-muted-foreground">Com Erro</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | Nfse["status"])}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="authorized">Autorizadas</SelectItem>
            <SelectItem value="processing">Processando</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="error">Com Erro</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Tomador</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : !filtered?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhuma NF-e encontrada
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="font-mono text-sm">
                    {n.nfse_number || "—"}
                  </TableCell>
                  <TableCell className="font-medium">{n.tomador_nome}</TableCell>
                  <TableCell>{formatCents(n.amount_cents)}</TableCell>
                  <TableCell>{fmtDateTime(n.authorization_date ?? n.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={nfseStatusColors[n.status]}>
                      {nfseStatusLabels[n.status]}
                    </Badge>
                    {n.status === "error" && n.error_message && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertTriangle className="inline ml-1.5 h-3.5 w-3.5 text-red-500" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{n.error_message}</TooltipContent>
                      </Tooltip>
                    )}
                    {n.api_response && (n.api_response as Record<string, unknown>)?.mock && (
                      <Badge variant="outline" className="ml-1.5 text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                        Mock
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {n.pdf_url && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                              <a href={n.pdf_url} target="_blank" rel="noopener noreferrer">
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Download PDF</TooltipContent>
                        </Tooltip>
                      )}
                      {n.status === "error" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => retryNfse.mutate(n)}
                              disabled={retryNfse.isPending}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Reemitir</TooltipContent>
                        </Tooltip>
                      )}
                      {(n.status === "authorized" || n.status === "processing") && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-red-500 hover:text-red-600"
                              onClick={() => setCancelTarget(n)}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Cancelar NF-e</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Cancel dialog */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar NF-e</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar a NF-e {cancelTarget?.nfse_number ?? ""}?
              {cancelTarget?.api_response && !(cancelTarget.api_response as Record<string, unknown>)?.mock && (
                <span className="block mt-1 text-red-500 font-medium">
                  Atenção: Esta NF-e será cancelada também na prefeitura.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Textarea
              placeholder="Motivo do cancelamento..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelNfse.isPending || !cancelReason.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelNfse.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
