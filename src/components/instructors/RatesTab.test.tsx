// Teste da tela de Taxas por serviço (PR-B). O que NÃO pode regredir:
// 1) salvar manda SÓ as células editadas, em centavos, num lote atômico;
// 2) valor inválido (zero/vazio/lixo/milhar) ABORTA o save inteiro;
// 3) lote 75/45 propõe SÓ pares vazios — nunca sobrescreve; e é bloqueado
//    com edições pendentes;
// 4) conflito de concorrência: tarifa mudou no servidor → rascunho é
//    descartado com aviso, nada é salvo às cegas;
// 5) sucesso limpa SÓ as células salvas (edição durante o voo sobrevive);
// 6) remover tarifa mata o rascunho da célula (sem ressuscitar no save);
// 7) pending desabilita tudo; sem admin, nada é editável.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, within, act } from "@testing-library/react";
import type { ReactNode } from "react";

// Radix não opera em jsdom: Select vira <select> nativo; Dialogs viram
// contêineres sempre-renderizados quando abertos (padrão da casa).
vi.mock("@/components/ui/select", () => {
  const Select = ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    disabled?: boolean;
    children?: ReactNode;
  }) => (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  );
  const SelectItem = ({ value, children }: { value: string; children?: ReactNode }) => (
    <option value={value}>{children}</option>
  );
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Select,
    SelectItem,
    SelectContent: Pass,
    SelectTrigger: Pass,
    SelectValue: () => null,
  };
});

vi.mock("@/components/ui/dialog", () => {
  const Dialog = ({ open, children }: { open?: boolean; children?: ReactNode }) =>
    open ? <div data-testid="batch-dialog">{children}</div> : null;
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog,
    DialogContent: Pass,
    DialogDescription: Pass,
    DialogFooter: Pass,
    DialogHeader: Pass,
    DialogTitle: Pass,
  };
});

vi.mock("@/components/ui/alert-dialog", () => {
  const AlertDialog = ({ open, children }: { open?: boolean; children?: ReactNode }) =>
    open ? <div data-testid="delete-dialog">{children}</div> : null;
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Btn = ({ onClick, children }: { onClick?: () => void; children?: ReactNode }) => (
    <button onClick={onClick}>{children}</button>
  );
  return {
    AlertDialog,
    AlertDialogAction: Btn,
    AlertDialogCancel: Btn,
    AlertDialogContent: Pass,
    AlertDialogDescription: Pass,
    AlertDialogFooter: Pass,
    AlertDialogHeader: Pass,
    AlertDialogTitle: Pass,
  };
});

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    disabled,
    onCheckedChange,
  }: {
    checked?: boolean;
    disabled?: boolean;
    onCheckedChange?: (v: boolean) => void;
  }) => (
    <input
      type="checkbox"
      checked={!!checked}
      disabled={disabled}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
}));

// Mocks de mutação que EXECUTAM onSuccess (como o react-query real) — sem
// isso, os caminhos de limpeza/sobrevivência de rascunho nunca rodam.
type MutateOpts = { onSuccess?: () => void } | undefined;
let saveAutoSuccess = true;
const saveCalls: Array<{ input: unknown; opts: MutateOpts }> = [];
const saveMutate = vi.fn((input: unknown, opts?: MutateOpts) => {
  saveCalls.push({ input, opts });
  if (saveAutoSuccess) opts?.onSuccess?.();
});
const applyMutate = vi.fn((_rows: unknown, opts?: MutateOpts) => opts?.onSuccess?.());
const deleteMutate = vi.fn((_id: unknown, opts?: MutateOpts) => opts?.onSuccess?.());

const saveState = { mutate: saveMutate, isPending: false };
const applyState = { mutate: applyMutate, isPending: false };
const deleteState = { mutate: deleteMutate, isPending: false };

const TRAINERS = [
  { id: "t-alex", full_name: "Alex Griebeler" },
  { id: "t-ceniz", full_name: "Alexandre Ceniz" },
];

const SERVICES = [
  { id: "s-grupo", slug: "grupo", name: "Grupo", delivery_type: "group", is_active: true, sort_order: 10 },
  { id: "s-personal", slug: "personal", name: "Personal", delivery_type: "personal", is_active: true, sort_order: 20 },
  { id: "s-fisio", slug: "fisioterapia", name: "Fisioterapia", delivery_type: "personal", is_active: true, sort_order: 30 },
];

// Alex já tem grupo+personal (semeado pela PR-A); Ceniz não tem nada.
// `RATES` é mutável: testes de conflito trocam o valor e re-renderizam.
let RATES = [
  { id: "r1", trainer_id: "t-alex", service_type_id: "s-grupo", rate_basis: "hourly", rate_cents: 10000 },
  { id: "r2", trainer_id: "t-alex", service_type_id: "s-personal", rate_basis: "hourly", rate_cents: 10000 },
];

vi.mock("@/hooks/useTrainers", () => ({
  useTrainers: () => ({ data: TRAINERS, isLoading: false }),
}));

vi.mock("@/hooks/useServiceRates", () => ({
  pairKey: (trainerId: string, serviceId: string) => `${trainerId}|${serviceId}`,
  RateConflictError: class RateConflictError extends Error {
    keys: string[];
    constructor(keys: string[]) {
      super("conflict");
      this.keys = keys;
    }
  },
  useServiceTypes: () => ({ data: SERVICES, isLoading: false }),
  useTrainerServiceRates: () => ({ data: RATES, isLoading: false, isError: false }),
  useSaveTrainerServiceRates: () => saveState,
  useApplyDefaultRates: () => applyState,
  useDeleteTrainerServiceRate: () => deleteState,
}));

import { RatesTab } from "./RatesTab";

const cell = (trainer: string, service: string) =>
  screen.getByLabelText(`Tarifa de ${trainer} em ${service}`);

describe("RatesTab", () => {
  beforeEach(() => {
    saveMutate.mockClear();
    applyMutate.mockClear();
    deleteMutate.mockClear();
    toastError.mockClear();
    saveCalls.length = 0;
    saveAutoSuccess = true;
    saveState.isPending = false;
    applyState.isPending = false;
    deleteState.isPending = false;
    RATES = [
      { id: "r1", trainer_id: "t-alex", service_type_id: "s-grupo", rate_basis: "hourly", rate_cents: 10000 },
      { id: "r2", trainer_id: "t-alex", service_type_id: "s-personal", rate_basis: "hourly", rate_cents: 10000 },
    ];
  });

  it("renderiza a matriz com tarifa existente e vazio como vazio", () => {
    render(<RatesTab isAdmin />);
    expect(cell("Alex Griebeler", "Grupo")).toHaveValue("100,00");
    expect(cell("Alexandre Ceniz", "Fisioterapia")).toHaveValue("");
  });

  it("edita uma célula e salva SÓ ela, em centavos", () => {
    render(<RatesTab isAdmin />);
    fireEvent.change(cell("Alexandre Ceniz", "Fisioterapia"), { target: { value: "120,00" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações \(1\)/ }));

    expect(saveMutate).toHaveBeenCalledTimes(1);
    const input = saveCalls[0].input as { rows: unknown; baselines: unknown };
    expect(input.rows).toEqual([
      {
        trainer_id: "t-ceniz",
        service_type_id: "s-fisio",
        rate_basis: "hourly",
        rate_cents: 12000,
      },
    ]);
    // Baseline viaja junto: célula era vazia quando a edição começou.
    expect(input.baselines).toEqual({ "t-ceniz|s-fisio": null });
  });

  it("valor zero aborta o save inteiro; milhar ambíguo também", () => {
    render(<RatesTab isAdmin />);
    fireEvent.change(cell("Alexandre Ceniz", "Grupo"), { target: { value: "45,00" } });
    fireEvent.change(cell("Alexandre Ceniz", "Personal"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações \(2\)/ }));
    expect(saveMutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);

    toastError.mockClear();
    fireEvent.change(cell("Alexandre Ceniz", "Personal"), { target: { value: "1.234,56" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações \(2\)/ }));
    expect(saveMutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("sucesso limpa SÓ as células salvas — edição durante o voo sobrevive", () => {
    saveAutoSuccess = false; // segura o onSuccess pra simular voo
    render(<RatesTab isAdmin />);
    fireEvent.change(cell("Alexandre Ceniz", "Fisioterapia"), { target: { value: "120,00" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações \(1\)/ }));
    expect(saveCalls).toHaveLength(1);

    // Durante o "voo", usuário edita OUTRA célula:
    fireEvent.change(cell("Alexandre Ceniz", "Grupo"), { target: { value: "45,00" } });
    // Resposta do servidor chega:
    act(() => saveCalls[0].opts?.onSuccess?.());

    // A célula salva foi limpa (volta ao persistido = vazio no mock),
    // a edição em voo NÃO foi perdida:
    expect(cell("Alexandre Ceniz", "Grupo")).toHaveValue("45,00");
    expect(screen.getByRole("button", { name: /Salvar alterações \(1\)/ })).toBeInTheDocument();
  });

  it("re-edição da MESMA célula durante o voo NÃO é apagada pelo sucesso", () => {
    saveAutoSuccess = false;
    render(<RatesTab isAdmin />);
    fireEvent.change(cell("Alexandre Ceniz", "Fisioterapia"), { target: { value: "120,00" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações \(1\)/ }));

    // Durante o voo, o usuário muda de ideia NA MESMA célula:
    fireEvent.change(cell("Alexandre Ceniz", "Fisioterapia"), { target: { value: "130,00" } });
    act(() => saveCalls[0].opts?.onSuccess?.());

    // A versão nova (130) sobrevive — a limpeza é por versão, não por chave:
    expect(cell("Alexandre Ceniz", "Fisioterapia")).toHaveValue("130,00");
    expect(screen.getByRole("button", { name: /Salvar alterações \(1\)/ })).toBeInTheDocument();
  });

  it("sobrevivente é REBASEADO: salvar o 130 depois do 120 gravado não vira conflito", () => {
    saveAutoSuccess = false;
    const { rerender } = render(<RatesTab isAdmin />);
    fireEvent.change(cell("Alexandre Ceniz", "Fisioterapia"), { target: { value: "120,00" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações \(1\)/ }));
    fireEvent.change(cell("Alexandre Ceniz", "Fisioterapia"), { target: { value: "130,00" } });
    act(() => saveCalls[0].opts?.onSuccess?.());

    // Invalidação traz o 120 recém-gravado do servidor:
    RATES = [
      ...RATES,
      { id: "r3", trainer_id: "t-ceniz", service_type_id: "s-fisio", rate_basis: "hourly", rate_cents: 12000 },
    ];
    rerender(<RatesTab isAdmin />);

    // Salvar o 130: NÃO é conflito (baseline foi rebaseada pro 120 gravado):
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações \(1\)/ }));
    expect(toastError).not.toHaveBeenCalled();
    expect(saveCalls).toHaveLength(2);
    const second = saveCalls[1].input as {
      rows: Array<{ rate_cents: number }>;
      baselines: Record<string, { cents: number; basis: string } | null>;
    };
    expect(second.rows[0].rate_cents).toBe(13000);
    expect(second.baselines["t-ceniz|s-fisio"]).toEqual({ cents: 12000, basis: "hourly" });
  });

  it("conflito: tarifa mudou no servidor → rascunho descartado, nada salvo", () => {
    const { rerender } = render(<RatesTab isAdmin />);
    fireEvent.change(cell("Alex Griebeler", "Grupo"), { target: { value: "80,00" } });

    // Outro admin salvou 90,00 (refetch trouxe valor novo):
    RATES = RATES.map((r) => (r.id === "r1" ? { ...r, rate_cents: 9000 } : r));
    rerender(<RatesTab isAdmin />);

    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações/ }));
    expect(saveMutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
    // Rascunho descartado: célula mostra o valor NOVO do servidor.
    expect(cell("Alex Griebeler", "Grupo")).toHaveValue("90,00");
  });

  it("lote 75/45 propõe SÓ pares vazios e confirma exatamente eles", () => {
    render(<RatesTab isAdmin />);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar padrão 75\/45/ }));

    const dialog = screen.getByTestId("batch-dialog");
    // Alex já tem grupo+personal → sem pares vazios e checkbox desabilitada.
    expect(within(dialog).getByText(/sem pares vazios do padrão/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /Preencher 2 tarifas/ }));
    expect(applyMutate).toHaveBeenCalledTimes(1);
    const [rows] = applyMutate.mock.calls[0];
    expect(rows).toEqual([
      { trainer_id: "t-ceniz", service_type_id: "s-grupo", rate_basis: "hourly", rate_cents: 4500 },
      { trainer_id: "t-ceniz", service_type_id: "s-personal", rate_basis: "hourly", rate_cents: 7500 },
    ]);
  });

  it("lote é bloqueado com edições pendentes", () => {
    render(<RatesTab isAdmin />);
    fireEvent.change(cell("Alexandre Ceniz", "Grupo"), { target: { value: "45,00" } });
    fireEvent.click(screen.getByRole("button", { name: /Aplicar padrão 75\/45/ }));
    expect(screen.queryByTestId("batch-dialog")).toBeNull();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("remoção pede confirmação, dispara e MATA o rascunho da célula", () => {
    render(<RatesTab isAdmin />);
    // Edita a célula que vai remover — o rascunho não pode ressuscitá-la.
    fireEvent.change(cell("Alex Griebeler", "Grupo"), { target: { value: "90,00" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Remover tarifa de Alex Griebeler em Grupo" }),
    );
    const dialog = screen.getByTestId("delete-dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remover" }));

    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate.mock.calls[0][0]).toEqual({
      id: "r1",
      expectedCents: 10000,
      expectedBasis: "hourly",
    });
    // Rascunho morreu: célula volta ao persistido do mock (não "90,00"),
    // e não há mais nada pra salvar.
    expect(cell("Alex Griebeler", "Grupo")).toHaveValue("100,00");
    expect(screen.queryByRole("button", { name: /Salvar alterações \(/ })).toBeNull();
  });

  it("pending trava os BOTÕES de ação, mas digitar segue livre", () => {
    saveState.isPending = true;
    render(<RatesTab isAdmin />);
    // Inputs livres: o clear seletivo pós-sucesso protege a edição em voo.
    expect(cell("Alex Griebeler", "Grupo")).toBeEnabled();
    expect(screen.getByRole("button", { name: /Aplicar padrão 75\/45/ })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remover tarifa de Alex Griebeler em Grupo" }),
    ).toBeDisabled();
  });

  it("sem admin: nada editável, sem salvar, sem lote", () => {
    render(<RatesTab isAdmin={false} />);
    expect(cell("Alex Griebeler", "Grupo")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Salvar alterações/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Aplicar padrão/ })).toBeNull();
  });
});
