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
  pairKey,
  RateConflictError,
  type RateBaseline,
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

// Rascunho por célula com BASELINE congelada no primeiro toque: se outro
// admin mudar a mesma tarifa enquanto se edita, o save detecta (baseline
// ≠ persistido atual), descarta o rascunho conflitado e avisa — nunca
// sobrescreve às cegas um valor que o usuário nem viu.
type CellDraft = {
  basisText: RateBasis;
  rateText: string;
  baseCents: number | null;
  baseBasis: RateBasis | null;
};
type DraftMap = Record<string, CellDraft>;

const cellKey = pairKey;

interface RatesTabProps {
  isAdmin: boolean;
}

export function RatesTab({ isAdmin }: RatesTabProps) {
  const { data: trainers, isLoading: loadingTrainers, isError: trainersError } = useTrainers(true);
  const { data: services, isLoading: loadingServices, isError: servicesError } = useServiceTypes();
  const { data: rates, isLoading: loadingRates, isError: ratesError } = useTrainerServiceRates();
  const saveRates = useSaveTrainerServiceRates();
  const applyDefaults = useApplyDefaultRates();
  const deleteRate = useDeleteTrainerServiceRate();

  const [draft, setDraft] = useState<DraftMap>({});
  const [pendingDelete, setPendingDelete] = useState<{ rate: TrainerServiceRate; label: string } | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Record<string, boolean>>({});

  // `busy` trava as AÇÕES (salvar/lote/remover) — nunca duas mutações
  // sobrepostas. Digitar continua liberado durante o voo: o clear seletivo
  // pós-sucesso garante que edição concorrente não se perde.
  const busy = saveRates.isPending || applyDefaults.isPending || deleteRate.isPending;

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
          baseCents: persisted?.rate_cents ?? null,
          baseBasis: persisted?.rate_basis ?? null,
        } satisfies CellDraft);
      return { ...d, [key]: { ...current, ...patch } };
    });
  };

  const dropDraftKeys = (keys: string[]) =>
    setDraft((d) => {
      const next = { ...d };
      for (const k of keys) delete next[k];
      return next;
    });

  /** Snapshot do que foi enviado, por célula (texto+base no momento do send). */
  type SentSnapshot = Record<string, { rateText: string; basisText: RateBasis }>;

  // Limpeza por VERSÃO, não por chave: só remove o rascunho se ele ainda
  // for exatamente o que foi enviado — re-edição da MESMA célula durante o
  // voo sobrevive (inputs ficam livres de propósito).
  const dropDraftIfUnchanged = (sent: SentSnapshot) =>
    setDraft((d) => {
      const next = { ...d };
      for (const [k, snap] of Object.entries(sent)) {
        const cur = next[k];
        if (cur && cur.rateText === snap.rateText && cur.basisText === snap.basisText) {
          delete next[k];
        }
      }
      return next;
    });

  // Pós-SUCESSO: célula idêntica ao enviado é limpa; re-edição em voo
  // sobrevive REBASEADA pro valor recém-gravado — sem isso, o próximo
  // save leria a própria gravação como "conflito" e apagaria a re-edição.
  const settleSavedDrafts = (sent: SentSnapshot, savedByKey: Record<string, RateUpsertRow>) =>
    setDraft((d) => {
      const next = { ...d };
      for (const [k, snap] of Object.entries(sent)) {
        const cur = next[k];
        if (!cur) continue;
        if (cur.rateText === snap.rateText && cur.basisText === snap.basisText) {
          delete next[k];
        } else {
          const saved = savedByKey[k];
          next[k] = { ...cur, baseCents: saved.rate_cents, baseBasis: saved.rate_basis };
        }
      }
      return next;
    });

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
    // 1º passe: conflito de concorrência — baseline do rascunho vs
    // persistido ATUAL. Conflitado é descartado (mostra o valor novo do
    // servidor), nada é salvo nesta passada.
    const conflicted = dirtyKeys.filter((key) => {
      const c = draft[key];
      const persisted = rateByCell[key] ?? null;
      return (
        (persisted?.rate_cents ?? null) !== c.baseCents ||
        (persisted?.rate_basis ?? null) !== c.baseBasis
      );
    });
    if (conflicted.length > 0) {
      const labels = conflicted
        .map((k) => {
          const [t, s] = k.split("|");
          return `${trainerName(t)} × ${serviceName(s)}`;
        })
        .join("; ");
      dropDraftKeys(conflicted);
      toast.error(
        `Tarifa alterada em outra sessão: ${labels}. O valor atual foi recarregado — revise antes de salvar.`,
      );
      return;
    }

    // 2º passe: validação — qualquer célula inválida aborta o lote inteiro.
    const rows: RateUpsertRow[] = [];
    for (const key of dirtyKeys) {
      const [trainerId, serviceId] = key.split("|");
      const c = draft[key];
      const cents = realToCents(c.rateText);
      if (!Number.isFinite(cents) || cents <= 0) {
        toast.error(
          `Tarifa inválida: ${trainerName(trainerId)} × ${serviceName(serviceId)}. ` +
            'Use números como "75", "75,50" ou "1234,56" (maior que zero, sem ponto de milhar) — ou remova pela lixeira.',
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
    const savedKeys = rows.map((r) => cellKey(r.trainer_id, r.service_type_id));
    // Baselines viajam com a mutação: o hook RELÊ os pares no servidor
    // imediatamente antes do upsert e aborta se algo mudou por baixo
    // (cache local desatualizado não passa).
    const baselines: Record<string, RateBaseline> = {};
    const sent: SentSnapshot = {};
    for (const key of savedKeys) {
      const c = draft[key];
      baselines[key] =
        c.baseCents !== null && c.baseBasis !== null
          ? { cents: c.baseCents, basis: c.baseBasis }
          : null;
      sent[key] = { rateText: c.rateText, basisText: c.basisText };
    }
    const savedByKey: Record<string, RateUpsertRow> = {};
    for (const r of rows) savedByKey[cellKey(r.trainer_id, r.service_type_id)] = r;
    saveRates.mutate(
      { rows, baselines },
      {
        // Limpa por VERSÃO e REBASEIA sobreviventes pro valor gravado.
        onSuccess: () => settleSavedDrafts(sent, savedByKey),
        // Conflito no servidor: descarta os rascunhos conflitados COMO
        // ENVIADOS (re-edição em voo fica; se mantiver baseline velha, o
        // próximo save conflita de novo e aí cai).
        onError: (e) => {
          if (e instanceof RateConflictError) {
            const conflictedSent: SentSnapshot = {};
            for (const k of e.keys) if (sent[k]) conflictedSent[k] = sent[k];
            dropDraftIfUnchanged(conflictedSent);
          }
        },
      },
    );
  };

  // ---- Ação em lote: pares vazios de grupo/personal dos treinadores marcados.
  const batchServices = useMemo(
    () => (services ?? []).filter((s) => s.slug in HOUSE_DEFAULTS && s.is_active),
    [services],
  );
  // Serviço do padrão desativado no catálogo = padrão PARCIAL (avisado no diálogo).
  const unavailableDefaults = useMemo(
    () =>
      Object.keys(HOUSE_DEFAULTS).filter(
        (slug) => !batchServices.some((s) => s.slug === slug),
      ),
    [batchServices],
  );

  const missingPairsFor = (trainerId: string): Array<{ service: ServiceType; cents: number }> =>
    batchServices
      .filter((s) => !rateByCell[cellKey(trainerId, s.id)])
      .map((s) => ({ service: s, cents: HOUSE_DEFAULTS[s.slug] }));

  const openBatch = () => {
    if (dirtyKeys.length > 0) {
      toast.error("Salve (ou descarte) as edições pendentes antes de aplicar o padrão em lote.");
      return;
    }
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

  // Qualquer fonte falhou = painel de erro. Renderizar com lista vazia
  // MENTIRIA na cobertura ("Grupo: completo" sem nenhum treinador checado).
  if (ratesError || trainersError || servicesError) {
    return (
      <div className="py-16 text-center text-sm text-destructive">
        Erro ao carregar {ratesError ? "as tarifas" : trainersError ? "os treinadores" : "o catálogo de serviços"}.
        Recarregue a página — nada foi alterado.
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
            <Button size="sm" variant="outline" onClick={openBatch} disabled={busy}>
              <Wand2 className="h-4 w-4 mr-1" />
              Aplicar padrão 75/45
            </Button>
          )}
          {isAdmin && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={dirtyKeys.length === 0 || busy}
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
                            disabled={busy}
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
                ? `${pendingDelete.label} — atenção: até a etapa da agenda (PR-C) entrar no ar, a folha atual segue usando a tarifa legada do cadastro e NADA muda no pagamento. Quando as tarifas por serviço assumirem, agendamentos futuros deste par ficarão sem tarifa (pulados com aviso); sessões já criadas mantêm o valor congelado.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) {
                  const key = cellKey(
                    pendingDelete.rate.trainer_id,
                    pendingDelete.rate.service_type_id,
                  );
                  // CAS no banco: só remove se ainda for exatamente o que o
                  // usuário confirmou. O rascunho da célula morre junto (por
                  // VERSÃO — edição feita após confirmar sobrevive), senão o
                  // próximo save ressuscitaria a tarifa recém-removida.
                  const cur = draft[key];
                  const confirmedSnap = cur
                    ? { [key]: { rateText: cur.rateText, basisText: cur.basisText } }
                    : {};
                  // Pós-remoção, a célula está VAZIA no servidor: sobrevivente
                  // re-editado em voo é rebaseado pra baseline null — senão o
                  // próximo save leria a remoção como conflito e o apagaria.
                  const settleAfterDelete = () =>
                    setDraft((d) => {
                      const c = d[key];
                      if (!c) return d;
                      const next = { ...d };
                      const snap = confirmedSnap[key];
                      if (snap && c.rateText === snap.rateText && c.basisText === snap.basisText) {
                        delete next[key];
                      } else {
                        next[key] = { ...c, baseCents: null, baseBasis: null };
                      }
                      return next;
                    });
                  deleteRate.mutate(
                    {
                      id: pendingDelete.rate.id,
                      expectedCents: pendingDelete.rate.rate_cents,
                      expectedBasis: pendingDelete.rate.rate_basis,
                    },
                    {
                      onSuccess: settleAfterDelete,
                      onError: (e) => {
                        if (e instanceof RateConflictError) settleAfterDelete();
                      },
                    },
                  );
                }
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
          {unavailableDefaults.length > 0 && (
            <div className="rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
              Atenção: o serviço {unavailableDefaults.join(" e ")} está
              desativado no catálogo — o padrão será aplicado só nos serviços
              ativos listados abaixo.
            </div>
          )}
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
                      ? "sem pares vazios do padrão"
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
