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
const updateMutate = vi.fn();
vi.mock("@/hooks/useSchedule", () => ({
  useCreateSession: () => ({ mutate: createMutate, isPending: false }),
  useUpdateSession: () => ({ mutate: updateMutate, isPending: false }),
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

// O mock do Select achata SelectTrigger (que carrega o aria-label) — os
// selects continuam identificados pela ORDEM no DOM, com helpers nomeados
// pra ficar legível e um único lugar pra ajustar se o form reordenar.
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

const EDIT_BASE = {
  id: "sess-1",
  session_type: "group" as const,
  modality: "flow",
  session_date: "2026-08-10",
  start_time: "07:00:00",
  end_time: "08:00:00",
  duration_minutes: 60,
  capacity: 12,
  trainer_id: "t-alex",
  student_id: null,
  template_id: null,
  service_type_id: "s-grupo",
  is_paid: false,
  notes: "",
};

const renderEdit = (over: Partial<typeof EDIT_BASE> & Record<string, unknown> = {}) => {
  render(
    <SessionFormDialog
      open
      onOpenChange={() => {}}
      editSession={{ ...EDIT_BASE, ...over } as never}
    />,
  );
};

describe("SessionFormDialog — edição e dinheiro congelado", () => {
  beforeEach(() => {
    createMutate.mockClear();
    updateMutate.mockClear();
    toastError.mockClear();
  });

  it("editar SÓ observações não recalcula nada: payload sem campos financeiros", () => {
    renderEdit();
    fireEvent.change(document.querySelector("textarea")!, { target: { value: "nota nova" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const [payload] = updateMutate.mock.calls[0];
    expect(payload.notes).toBe("nota nova");
    expect(payload).not.toHaveProperty("payment_amount_cents");
    expect(payload).not.toHaveProperty("trainer_hourly_rate_cents");
    expect(payload).not.toHaveProperty("payment_rate_basis");
  });

  it("sessão PAGA: mudar duração é bloqueado com aviso, nada gravado", () => {
    renderEdit({ is_paid: true });
    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(updateMutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0][0])).toContain("paga");
  });

  it("sessão PAGA: mudar a DATA também é bloqueado (não muda de período da folha)", () => {
    renderEdit({ is_paid: true });
    const dateInput = document.querySelector('input[type="date"]')!;
    fireEvent.change(dateInput, { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(updateMutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("sessão PAGA: editar SÓ observações passa, e o payload é SÓ observações", () => {
    renderEdit({ is_paid: true });
    fireEvent.change(document.querySelector("textarea")!, { target: { value: "obs paga" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const [payload] = updateMutate.mock.calls[0];
    expect(payload).toEqual({ id: "sess-1", notes: "obs paga" });
  });

  it("mudar duração em NÃO-paga recalcula pela tarifa do par", () => {
    renderEdit();
    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const [payload] = updateMutate.mock.calls[0];
    expect(payload.payment_amount_cents).toBe(15000); // 1,5h × 100/h
    expect(payload.payment_rate_basis).toBe("hourly");
  });

  it("trocar para treinador SEM tarifa no serviço: bloqueio visível", () => {
    renderEdit();
    // Ceniz não tem tarifa de grupo:
    fireEvent.change(selects()[1], { target: { value: "t-ceniz" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(updateMutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("serviço HISTÓRICO da sessão é preservado na edição (não flipa pro ativo único)", () => {
    // sessão antiga classificada num serviço que nem está mais no catálogo ativo:
    renderEdit({ service_type_id: "s-antigo", duration_minutes: 90 });
    // muda a duração (mexe em dinheiro) SEM tocar no serviço: o par
    // (t-alex × s-antigo) não tem tarifa → bloqueio explícito, e NUNCA
    // troca silenciosa pro serviço ativo único.
    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(updateMutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
    // e o aviso é sobre tarifa (par exato), não sobre serviço trocado:
    expect(String(toastError.mock.calls[0][0])).toContain("tarifa");
  });
});
