// Testes dos caminhos de DINHEIRO do TrainerFormDialog (PR-B mexeu neles):
// os três campos de taxa viraram rascunho-texto + parser estrito no submit.
// O que não pode regredir: centavos corretos no payload, milhar ambíguo
// rejeitado NOMEANDO o campo, e campo oculto por payment_method também
// validado (com aviso de onde ele está).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@/components/ui/select", () => {
  const Select = ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children?: ReactNode;
  }) => (
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

// Tabs do Radix não renderizam conteúdo inativo em jsdom: render tudo.
vi.mock("@/components/ui/tabs", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Tabs: Pass, TabsContent: Pass, TabsList: Pass, TabsTrigger: Pass };
});

vi.mock("@/components/ui/switch", () => ({
  Switch: () => <input type="checkbox" />,
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
}));

const createMutate = vi.fn();
const updateMutate = vi.fn();
vi.mock("@/hooks/useTrainers", () => ({
  useCreateTrainer: () => ({ mutate: createMutate, isPending: false }),
  useUpdateTrainer: () => ({ mutate: updateMutate, isPending: false }),
  useTrainerAdmin: () => ({ isSuccess: false, isFetching: false, isError: false, data: null }),
}));

import { TrainerFormDialog } from "./TrainerFormDialog";

const setup = () => {
  render(<TrainerFormDialog open onOpenChange={() => {}} trainer={null} />);
  // Nome é obrigatório pro submit liberar:
  const nameInput = screen.getAllByRole("textbox")[0];
  fireEvent.change(nameInput, { target: { value: "Treinadora Nova" } });
};

describe("TrainerFormDialog — dinheiro", () => {
  beforeEach(() => {
    createMutate.mockClear();
    updateMutate.mockClear();
    toastError.mockClear();
  });

  it("criação grava centavos corretos (inclusive quatro dígitos com decimal)", () => {
    setup();
    // payment_method default hourly → visíveis: Principal e Assistente ("0,00").
    const [main, assistant] = screen.getAllByDisplayValue("0,00");
    fireEvent.change(main, { target: { value: "1234,56" } });
    fireEvent.change(assistant, { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    const [payload] = createMutate.mock.calls[0];
    expect(payload.hourly_rate_main_cents).toBe(123456);
    expect(payload.hourly_rate_assistant_cents).toBe(4500);
    expect(payload.session_rate_cents).toBe(0);
  });

  it("milhar ambíguo aborta NOMEANDO o campo — nada é gravado", () => {
    setup();
    const [main] = screen.getAllByDisplayValue("0,00");
    fireEvent.change(main, { target: { value: "1.234,56" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    expect(createMutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0][0])).toContain("Taxa/hora — Principal");
  });

  it("campo INVÁLIDO oculto por outro payment_method também aborta, apontando onde está", () => {
    setup();
    const [main] = screen.getAllByDisplayValue("0,00");
    fireEvent.change(main, { target: { value: "75," } });
    // Troca pra "Por sessão": o campo Principal (inválido) some da tela.
    const paymentSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(paymentSelect, { target: { value: "per_session" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    expect(createMutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
    const msg = String(toastError.mock.calls[0][0]);
    expect(msg).toContain("Taxa/hora — Principal");
    expect(msg).toContain("outra opção de método de pagamento");
  });
});
