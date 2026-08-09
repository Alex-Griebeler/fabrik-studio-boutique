// PR-E: o cadastro do treinador NÃO edita mais tarifa nenhuma.
// O que não pode regredir: payload sem os campos legados (o save não pode
// "ressuscitar" tarifa aposentada) e a aba Taxas como resumo somente-leitura
// apontando pra "Pagamentos à equipe".
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@/components/ui/select", () => {
  const Select = ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children?: ReactNode }) => (
    <select value={value ?? ""} onChange={(e) => onValueChange?.(e.target.value)}>
      <option value="" />
      {children}
    </select>
  );
  const SelectItem = ({ value, children }: { value: string; children?: ReactNode }) => (
    <option value={value}>{children}</option>
  );
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return { Select, SelectItem, SelectContent: Pass, SelectTrigger: Pass, SelectValue: () => null };
});

vi.mock("@/components/ui/dialog", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Dialog: Pass, DialogContent: Pass, DialogHeader: Pass, DialogTitle: Pass };
});

vi.mock("@/components/ui/tabs", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Tabs: Pass, TabsContent: Pass, TabsList: Pass, TabsTrigger: Pass };
});

vi.mock("@/components/ui/switch", () => ({ Switch: () => <input type="checkbox" /> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const createMutate = vi.fn();
const updateMutate = vi.fn();
vi.mock("@/hooks/useTrainers", () => ({
  useCreateTrainer: () => ({ mutate: createMutate, isPending: false }),
  useUpdateTrainer: () => ({ mutate: updateMutate, isPending: false }),
  useTrainerAdmin: () => ({ isSuccess: false, isFetching: false, isError: false, data: null }),
}));

vi.mock("@/hooks/useServiceRates", () => ({
  useServiceTypes: () => ({
    data: [{ id: "s-fisio", slug: "fisioterapia", name: "Fisioterapia", delivery_type: "personal", is_active: true, sort_order: 30 }],
  }),
  useTrainerServiceRates: () => ({
    data: [{ id: "r1", trainer_id: "t-ceniz", service_type_id: "s-fisio", rate_basis: "per_session", rate_cents: 10800 }],
  }),
}));

import { TrainerFormDialog } from "./TrainerFormDialog";

describe("TrainerFormDialog — tarifas aposentadas do cadastro (PR-E)", () => {
  beforeEach(() => {
    createMutate.mockClear();
    updateMutate.mockClear();
  });

  it("criação: payload NÃO carrega nenhum campo legado de tarifa", () => {
    render(<TrainerFormDialog open onOpenChange={() => {}} trainer={null} />);
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Treinadora Nova" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    const [payload] = createMutate.mock.calls[0];
    for (const legacy of [
      "hourly_rate_main_cents",
      "hourly_rate_assistant_cents",
      "session_rate_cents",
      "payment_method",
    ]) {
      expect(payload).not.toHaveProperty(legacy);
    }
  });

  it("criação: aba Taxas orienta pra Pagamentos à equipe, sem inputs de valor", () => {
    render(<TrainerFormDialog open onOpenChange={() => {}} trainer={null} />);
    expect(screen.getByText(/Pagamentos à equipe/)).toBeInTheDocument();
    expect(screen.queryByText(/Taxa\/hora/)).toBeNull();
  });

  it("edição: resumo somente-leitura mostra as tarifas por serviço do profissional", () => {
    render(
      <TrainerFormDialog
        open
        onOpenChange={() => {}}
        trainer={{ id: "t-ceniz", full_name: "Alexandre Ceniz" } as never}
      />,
    );
    expect(screen.getByText("Fisioterapia")).toBeInTheDocument();
    expect(screen.getByText("R$ 108,00/sessão")).toBeInTheDocument();
  });
});
