import { useMemo, useState } from "react";
import { Loader2, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { useTrainers } from "@/hooks/useTrainers";
import {
  useServiceTypes,
  useTrainerServiceRates,
  useSaveTrainerServiceRates,
  useApplyDefaultRates,
  useDeleteTrainerServiceRate,
  type RateBasis,
  type RateUpsertRow,
  type ServiceType,
  type TrainerServiceRate,
} from "@/hooks/useServiceRates";
import { centsToReal, realToCents } from "@/lib/money";

// Padrão da casa (ratificado pelo Alex em 07/08): personal 75/h, grupo 45/h.
// A ação em lote SÓ preenche pares vazios — exceções são gesto manual.
const HOUSE_DEFAULTS: Record<string, number> = {
  personal: 7500,
  grupo: 4500,
};

const BASIS_LABEL: Record<RateBasis, string> = {
  hourly: "R$/hora",
  per_session: "R$/sessão",
};

type CellDraft = { basisText: RateBasis; rateText: string };
type DraftMap = Record<string, CellDraft>;

const cellKey = (trainerId: string, serviceId: string) => `${trainerId}|${serviceId}`;

interface RatesTabProps {
  isAdmin: boolean;
}

export function RatesTab({ isAdmin }: RatesTabProps) {
  const { data: trainers, isLoading: loadingTrainers } = useTrainers(true);
  const { data: services, isLoading: loadingServices } = useServiceTypes();
  const { data: rates, isLoading: loadingRates, isError: ratesError } = useTrainerServiceRates();
  const saveRates = useSaveTrainerServiceRates();
  const applyDefaults = useApplyDefaultRates();
  const deleteRate = useDeleteTrainerServiceRate();

  const [draft, setDraft] = useState<DraftMap>({});
  const [pendingDelete, setPendingDelete] = useState<{ rate: TrainerServiceRate; label: string } | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Record<string, boolean>>({});

  const rateByCell = useMemo(() => {
    const map: Record<string, TrainerServiceRate> = {};
    for (const r of rates ?? []) map[cellKey(r.trainer_id, r.service_type_id)] = r;
    return map;
  }, [rates]);

  const setCell = (key: string, patch: Partial<CellDraft>, persisted?: TrainerServiceRate) => {
    setDraft((d) => {
      const current =
        d[key] ??
        ({
          basisText: persisted?.rate_basis ?? "hourly",
          rateText: persisted ? centsToReal(persisted.rate_cents) : "",
        } satisfies CellDraft);
      return { ...d, [key]: { ...current, ...patch } };
    });
  };

  // Uma célula é "suja" se o rascunho difere do persistido (ou cria valor novo).
  const dirtyKeys = useMemo(() => {
    return Object.keys(draft).filter((key) => {
      const c = draft[key];
      const persisted = rateByCell[key];
      if (!persisted) return c.rateText.trim() !== "";
      return (
        c.basisText !== persisted.rate_basis ||
        realToCents(c.rateText) !== persisted.rate_cents
      );
    });
  }, [draft, rateByCell]);

  const trainerName = (id: string) =>
    trainers?.find((t) => t.id === id)?.full_name ?? id;
  const serviceName = (id: string) =>
    services?.find((s) => s.id === id)?.name ?? id;

  const handleSave = () => {
    const rows: RateUpsertRow[] = [];
    for (const key of dirtyKeys) {
      const [trainerId, serviceId] = key.split("|");
      const c = draft[key];
      const cents = realToCents(c.rateText);
      if (!Number.isFinite(cents) || cents <= 0) {
        toast.error(
          `Tarifa inválida: ${trainerName(trainerId)} × ${serviceName(serviceId)}. ` +
            "Informe um valor maior que zero (ou remova a tarifa pela lixeira).",
        );
        return; // nada é salvo — ou tudo válido, ou nada
      }
      rows.push({
        trainer_id: trainerId,
        service_type_id: serviceId,
        rate_basis: c.basisText,
        rate_cents: cents,
      });
    }
    if (rows.length === 0) return;
    saveRates.mutate(rows, { onSuccess: () => setDraft({}) });
  };

  // ---- Ação em lote: pares vazios de grupo/personal dos treinadores marcados.
  const batchServices = useMemo(
    () => (services ?? []).filter((s) => s.slug in HOUSE_DEFAULTS && s.is_active),
    [services],
  );

  const missingPairsFor = (trainerId: string): Array<{ service: ServiceType; cents: number }> =>
    batchServices
      .filter((s) => !rateByCell[cellKey(trainerId, s.id)])
      .map((s) => ({ service: s, cents: HOUSE_DEFAULTS[s.slug] }));

  const openBatch = () => {
    const preSelected: Record<string, boolean> = {};
    for (const t of trainers ?? []) {
      if (missingPairsFor(t.id).length > 0) preSelected[t.id] = true;
    }
    setBatchSelected(preSelected);
    setBatchOpen(true);
  };

  const batchRows: RateUpsertRow[] = useMemo(() => {
    const rows: RateUpsertRow[] = [];
    for (const t of trainers ?? []) {
      if (!batchSelected[t.id]) continue;
      for (const { service, cents } of missingPairsFor(t.id)) {
        rows.push({
          trainer_id: t.id,
          service_type_id: service.id,
          rate_basis: "hourly",
          rate_cents: cents,
        });
      }
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchSelected, trainers, batchServices, rateByCell]);

  const handleBatchConfirm = () => {
    applyDefaults.mutate(batchRows, { onSuccess: () => setBatchOpen(false) });
  };

  // ---- Prontidão (o "relatório" da tela): pares vazios por serviço.
  const coverage = useMemo(() => {
    return (services ?? []).map((s) => {
      const missing = (trainers ?? []).filter(
        (t) => !rateByCell[cellKey(t.id, s.id)],
      ).length;
      return { service: s, missing };
    });
  }, [services, trainers, rateByCell]);

  if (loadingTrainers || loadingServices || loadingRates) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span className="text-sm">Carregando tarifas...</span>
      </div>
    );
  }

  if (ratesError) {
    return (
      <div className="py-16 text-center text-sm text-destructive">
        Erro ao carregar as tarifas. Recarregue a página — nada foi alterado.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
        A agenda e a folha ainda usam a tarifa legada do cadastro do treinador.
        Esta tela prepara as tarifas por serviço — elas passam a valer quando a
        etapa da agenda (PR-C) entrar no ar.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {coverage.map(({ service, missing }) => (
          <Badge
            key={service.id}
            variant={missing === 0 ? "default" : "secondary"}
            className={missing === 0 ? "" : "text-amber-700 dark:text-amber-300"}
          >
            {service.name}: {missing === 0 ? "completo" : `${missing} sem tarifa`}
          </Badge>
        ))}
        <div className="ml-auto flex gap-2">
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={openBatch}>
              <Wand2 className="h-4 w-4 mr-1" />
              Aplicar padrão 75/45
            </Button>
          )}
          {isAdmin && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={dirtyKeys.length === 0 || saveRates.isPending}
            >
              {saveRates.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : null}
              Salvar alterações{dirtyKeys.length > 0 ? ` (${dirtyKeys.length})` : ""}
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left font-medium px-3 py-2 min-w-[180px]">Treinador</th>
              {(services ?? []).map((s) => (
                <th key={s.id} className="text-left font-medium px-3 py-2 min-w-[210px]">
                  {s.name}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({s.delivery_type === "group" ? "turma" : "individual"})
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(trainers ?? []).map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium whitespace-nowrap">{t.full_name}</td>
                {(services ?? []).map((s) => {
                  const key = cellKey(t.id, s.id);
                  const persisted = rateByCell[key];
                  const cell = draft[key];
                  const rateValue =
                    cell?.rateText ?? (persisted ? centsToReal(persisted.rate_cents) : "");
                  const basisValue = cell?.basisText ?? persisted?.rate_basis ?? "hourly";
                  return (
                    <td key={s.id} className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Input
                          aria-label={`Tarifa de ${t.full_name} em ${s.name}`}
                          className="h-8 w-24"
                          inputMode="decimal"
                          placeholder="—"
                          disabled={!isAdmin}
                          value={rateValue}
                          onChange={(e) =>
                            setCell(key, { rateText: e.target.value }, persisted)
                          }
                        />
                        <Select
                          value={basisValue}
                          onValueChange={(v) =>
                            setCell(key, { basisText: v as RateBasis }, persisted)
                          }
                          disabled={!isAdmin}
                        >
                          <SelectTrigger
                            aria-label={`Base de ${t.full_name} em ${s.name}`}
                            className="h-8 w-[110px]"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hourly">{BASIS_LABEL.hourly}</SelectItem>
                            <SelectItem value="per_session">{BASIS_LABEL.per_session}</SelectItem>
                          </SelectContent>
                        </Select>
                        {isAdmin && persisted && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            aria-label={`Remover tarifa de ${t.full_name} em ${s.name}`}
                            onClick={() =>
                              setPendingDelete({
                                rate: persisted,
                                label: `${t.full_name} × ${s.name}`,
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirmação de remoção — remoção é imediata e individual (atômica). */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover tarifa?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${pendingDelete.label} — sessões já criadas mantêm o valor congelado; a remoção só afeta agendamentos futuros (que ficarão sem tarifa e serão pulados com aviso).`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) deleteRate.mutate(pendingDelete.rate.id);
                setPendingDelete(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ação em lote com revisão explícita — só preenche pares VAZIOS. */}
      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Aplicar padrão da casa</DialogTitle>
            <DialogDescription>
              Personal R$ 75,00/h · Grupo R$ 45,00/h. Só preenche pares ainda
              sem tarifa — nenhuma tarifa existente é sobrescrita. Exceções
              (ex.: fisioterapia) continuam manuais.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-2">
            {(trainers ?? []).map((t) => {
              const missing = missingPairsFor(t.id);
              return (
                <label
                  key={t.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={!!batchSelected[t.id]}
                    disabled={missing.length === 0}
                    onCheckedChange={(v) =>
                      setBatchSelected((sel) => ({ ...sel, [t.id]: v === true }))
                    }
                  />
                  <span className="font-medium">{t.full_name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {missing.length === 0
                      ? "já completo"
                      : missing
                          .map((m) => `${m.service.name} R$ ${centsToReal(m.cents)}/h`)
                          .join(" · ")}
                  </span>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleBatchConfirm}
              disabled={batchRows.length === 0 || applyDefaults.isPending}
            >
              {applyDefaults.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : null}
              Preencher {batchRows.length} tarifa{batchRows.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
