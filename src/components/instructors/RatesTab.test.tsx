// Teste da tela de Taxas por serviço (PR-B). O que NÃO pode regredir:
// 1) salvar manda SÓ as células editadas, convertidas pra centavos, num lote;
// 2) valor inválido (zero/vazio/lixo) ABORTA o save inteiro com erro visível;
// 3) a ação em lote 75/45 propõe SÓ pares vazios — nunca sobrescreve;
// 4) sem admin, nada é editável.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, within } from "@testing-library/react";
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

const saveMutate = vi.fn();
const applyMutate = vi.fn();
const deleteMutate = vi.fn();

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
const RATES = [
  { id: "r1", trainer_id: "t-alex", service_type_id: "s-grupo", rate_basis: "hourly", rate_cents: 10000 },
  { id: "r2", trainer_id: "t-alex", service_type_id: "s-personal", rate_basis: "hourly", rate_cents: 10000 },
];

vi.mock("@/hooks/useTrainers", () => ({
  useTrainers: () => ({ data: TRAINERS, isLoading: false }),
}));

vi.mock("@/hooks/useServiceRates", () => ({
  useServiceTypes: () => ({ data: SERVICES, isLoading: false }),
  useTrainerServiceRates: () => ({ data: RATES, isLoading: false, isError: false }),
  useSaveTrainerServiceRates: () => ({ mutate: saveMutate, isPending: false }),
  useApplyDefaultRates: () => ({ mutate: applyMutate, isPending: false }),
  useDeleteTrainerServiceRate: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { RatesTab } from "./RatesTab";

describe("RatesTab", () => {
  beforeEach(() => {
    saveMutate.mockClear();
    applyMutate.mockClear();
    deleteMutate.mockClear();
    toastError.mockClear();
  });

  it("renderiza a matriz com tarifa existente e vazio como vazio", () => {
    render(<RatesTab isAdmin />);
    expect(screen.getByLabelText("Tarifa de Alex Griebeler em Grupo")).toHaveValue("100,00");
    expect(screen.getByLabelText("Tarifa de Alexandre Ceniz em Fisioterapia")).toHaveValue("");
  });

  it("edita uma célula e salva SÓ ela, em centavos", () => {
    render(<RatesTab isAdmin />);
    const cell = screen.getByLabelText("Tarifa de Alexandre Ceniz em Fisioterapia");
    fireEvent.change(cell, { target: { value: "120,00" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações \(1\)/ }));

    expect(saveMutate).toHaveBeenCalledTimes(1);
    const [rows] = saveMutate.mock.calls[0];
    expect(rows).toEqual([
      {
        trainer_id: "t-ceniz",
        service_type_id: "s-fisio",
        rate_basis: "hourly",
        rate_cents: 12000,
      },
    ]);
  });

  it("valor zero aborta o save inteiro com erro visível", () => {
    render(<RatesTab isAdmin />);
    const ok = screen.getByLabelText("Tarifa de Alexandre Ceniz em Grupo");
    const bad = screen.getByLabelText("Tarifa de Alexandre Ceniz em Personal");
    fireEvent.change(ok, { target: { value: "45,00" } });
    fireEvent.change(bad, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações \(2\)/ }));

    expect(saveMutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("lote 75/45 propõe SÓ pares vazios e confirma exatamente eles", () => {
    render(<RatesTab isAdmin />);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar padrão 75\/45/ }));

    const dialog = screen.getByTestId("batch-dialog");
    // Alex já tem grupo+personal → "já completo" e checkbox desabilitada.
    expect(within(dialog).getByText(/já completo/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /Preencher 2 tarifas/ }));
    expect(applyMutate).toHaveBeenCalledTimes(1);
    const [rows] = applyMutate.mock.calls[0];
    expect(rows).toEqual([
      { trainer_id: "t-ceniz", service_type_id: "s-grupo", rate_basis: "hourly", rate_cents: 4500 },
      { trainer_id: "t-ceniz", service_type_id: "s-personal", rate_basis: "hourly", rate_cents: 7500 },
    ]);
  });

  it("remoção pede confirmação e só então dispara", () => {
    render(<RatesTab isAdmin />);
    fireEvent.click(
      screen.getByRole("button", { name: "Remover tarifa de Alex Griebeler em Grupo" }),
    );
    const dialog = screen.getByTestId("delete-dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remover" }));
    expect(deleteMutate).toHaveBeenCalledWith("r1");
  });

  it("sem admin: nada editável, sem salvar, sem lote", () => {
    render(<RatesTab isAdmin={false} />);
    expect(screen.getByLabelText("Tarifa de Alex Griebeler em Grupo")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Salvar alterações/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Aplicar padrão/ })).toBeNull();
  });
});
