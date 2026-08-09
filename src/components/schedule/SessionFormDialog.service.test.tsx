// Testes do serviço na criação manual de sessão (PR-C):
// 1) turma: serviço único (Grupo) é usado SEM seletor no formulário;
// 2) individual: seletor aparece (Personal × Fisioterapia) e o payload
//    carrega serviço + base + valor calculado pela base;
// 3) treinador sem tarifa no serviço escolhido = bloqueio VISÍVEL;
// 4) sessão sem treinador continua permitida (snapshot zerado, base null).
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

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
}));

const createMutate = vi.fn();
vi.mock("@/hooks/useSchedule", () => ({
  useCreateSession: () => ({ mutate: createMutate, isPending: false }),
  useUpdateSession: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateThisAndFollowing: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAllOccurrences: () => ({ mutate: vi.fn(), isPending: false }),
  useActiveModalities: () => ({
    data: [
      { id: "m1", slug: "flow", name: "Flow" },
      { id: "m2", slug: "personal", name: "Personal" },
    ],
  }),
}));

vi.mock("@/hooks/useTrainers", () => ({
  useTrainers: () => ({
    data: [
      { id: "t-alex", full_name: "Alex Griebeler", hourly_rate_main_cents: 0 },
      { id: "t-ceniz", full_name: "Alexandre Ceniz", hourly_rate_main_cents: 0 },
    ],
  }),
}));

vi.mock("@/hooks/useStudents", () => ({
  useStudents: () => ({ data: [{ id: "st-1", full_name: "Aluna Um" }] }),
}));

vi.mock("@/hooks/useServiceRates", () => ({
  pairKey: (a: string, b: string) => `${a}|${b}`,
  useServiceTypes: () => ({
    data: [
      { id: "s-grupo", slug: "grupo", name: "Grupo", delivery_type: "group", is_active: true, sort_order: 10 },
      { id: "s-personal", slug: "personal", name: "Personal", delivery_type: "personal", is_active: true, sort_order: 20 },
      { id: "s-fisio", slug: "fisioterapia", name: "Fisioterapia", delivery_type: "personal", is_active: true, sort_order: 30 },
    ],
  }),
  useTrainerServiceRates: () => ({
    data: [
      { id: "r1", trainer_id: "t-alex", service_type_id: "s-grupo", rate_basis: "hourly", rate_cents: 10000 },
      { id: "r2", trainer_id: "t-ceniz", service_type_id: "s-fisio", rate_basis: "per_session", rate_cents: 10800 },
    ],
  }),
}));

import { SessionFormDialog } from "./SessionFormDialog";

const setup = () => {
  render(<SessionFormDialog open onOpenChange={() => {}} defaultDate="2026-08-10" />);
};

// selects na ordem do DOM: [modalidade, (serviço se >1 opção), treinador, (aluno)]
const selects = () => screen.getAllByRole("combobox");

describe("SessionFormDialog — serviço e tarifa por par", () => {
  beforeEach(() => {
    createMutate.mockClear();
    toastError.mockClear();
  });

  it("turma: serviço único (Grupo) SEM seletor; payload leva serviço + base hourly", () => {
    setup();
    // grupo tem 1 opção de serviço → sem select de serviço no DOM:
    // [modalidade, treinador]
    expect(selects()).toHaveLength(2);
    fireEvent.change(selects()[0], { target: { value: "flow" } });
    fireEvent.change(selects()[1], { target: { value: "t-alex" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar Sessão" }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    const [payload] = createMutate.mock.calls[0];
    expect(payload.service_type_id).toBe("s-grupo");
    expect(payload.payment_rate_basis).toBe("hourly");
    expect(payload.trainer_hourly_rate_cents).toBe(10000);
    expect(payload.payment_amount_cents).toBe(10000); // 60min × 100/h
  });

  it("individual: seletor aparece; fisio per_session paga o valor CRAVADO", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Personal" }));
    // agora: [modalidade, serviço, treinador, aluno]
    expect(selects()).toHaveLength(4);
    fireEvent.change(selects()[0], { target: { value: "personal" } });
    fireEvent.change(selects()[1], { target: { value: "s-fisio" } });
    fireEvent.change(selects()[2], { target: { value: "t-ceniz" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar Sessão" }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    const [payload] = createMutate.mock.calls[0];
    expect(payload.service_type_id).toBe("s-fisio");
    expect(payload.payment_rate_basis).toBe("per_session");
    expect(payload.payment_amount_cents).toBe(10800); // cravado, não ×duração
  });

  it("treinador SEM tarifa no serviço escolhido: bloqueio visível, nada criado", () => {
    setup();
    fireEvent.change(selects()[0], { target: { value: "flow" } });
    // Ceniz não tem tarifa de GRUPO (só fisio):
    fireEvent.change(selects()[1], { target: { value: "t-ceniz" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar Sessão" }));

    expect(createMutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0][0])).toContain("Pagamentos à equipe");
  });

  it("individual sem escolher serviço: pede a escolha, nada criado", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Personal" }));
    fireEvent.change(selects()[0], { target: { value: "personal" } });
    fireEvent.change(selects()[2], { target: { value: "t-alex" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar Sessão" }));

    expect(createMutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0][0])).toContain("serviço");
  });

  it("sessão SEM treinador segue permitida: snapshot zerado com base null", () => {
    setup();
    fireEvent.change(selects()[0], { target: { value: "flow" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar Sessão" }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    const [payload] = createMutate.mock.calls[0];
    expect(payload.trainer_id).toBeNull();
    expect(payload.service_type_id).toBe("s-grupo");
    expect(payload.payment_amount_cents).toBe(0);
    expect(payload.payment_rate_basis).toBeNull();
  });
});
