import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

/**
 * Teste do CALLER REAL (exigência da auditoria da Onda 2a): o backend
 * aplica a regra de vencimento da Fabrik, mas é a tela que decide se
 * manda datas explícitas — e explícitas TÊM precedência. Sem este teste,
 * alguém devolve `installment_dates: installmentDates` no submit e o
 * passo de 30 dias volta a valer na prática, sem quebrar nada.
 */

const createMutate = vi.fn();
const updateMutate = vi.fn();

// Select do shadcn/Radix não opera em jsdom; troca por <select> nativo.
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
  const Nothing = () => null;
  return {
    Select,
    SelectItem,
    SelectContent: Pass,
    SelectTrigger: Nothing,
    SelectValue: Nothing,
    SelectGroup: Pass,
    SelectLabel: Pass,
    SelectSeparator: Nothing,
  };
});

vi.mock("@/hooks/useContracts", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useContracts")>(
    "@/hooks/useContracts",
  );
  return {
    ...actual,
    useCreateContract: () => ({ mutate: createMutate, isPending: false }),
    useUpdateContract: () => ({ mutate: updateMutate, isPending: false }),
  };
});

// Referências ESTÁVEIS: o dialog tem useMemo/useEffect dependendo de
// `plans`; devolver array novo a cada render gera re-render infinito.
const STUDENTS_RESULT = {
  data: [{ id: "student-1", full_name: "Aluna Teste" }],
} as const;
const PLANS_RESULT = {
  data: [
    {
      id: "plan-1",
      name: "Plano Anual",
      price_cents: 120000,
      duration: "anual",
      category: "group",
      is_active: true,
    },
  ],
} as const;

vi.mock("@/hooks/useStudents", () => ({
  useStudents: () => STUDENTS_RESULT,
}));

vi.mock("@/hooks/usePlans", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/usePlans")>("@/hooks/usePlans");
  return { ...actual, usePlans: () => PLANS_RESULT };
});

import { ContractFormDialog } from "./ContractFormDialog";

/** Seleciona um método de pagamento que exibe parcelas (dcc/pix). */
function escolherMetodo(valor: "pix" | "dcc") {
  const selects = Array.from(document.querySelectorAll("select"));
  const alvo = selects.find((s) => s.querySelector(`option[value="${valor}"]`));
  expect(alvo, `select com opção ${valor}`).toBeTruthy();
  fireEvent.change(alvo!, { target: { value: valor } });
}

function parcelasVisiveis(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="date"].h-8'));
}

function submitPayload(): Record<string, unknown> {
  const form = document.querySelector("form");
  fireEvent.submit(form!);
  expect(createMutate).toHaveBeenCalled();
  return createMutate.mock.calls[0][0] as Record<string, unknown>;
}

describe("ContractFormDialog — não sobrescreve a regra de vencimento do backend", () => {
  beforeEach(() => {
    createMutate.mockClear();
    updateMutate.mockClear();
  });

  it("mostra o preview das parcelas quando o método exibe parcelamento", () => {
    render(<ContractFormDialog open onOpenChange={() => {}} />);
    escolherMetodo("pix");
    expect(parcelasVisiveis().length).toBeGreaterThan(0);
  });

  it("SEM edição manual: não envia installment_dates, mesmo com preview na tela", () => {
    render(<ContractFormDialog open onOpenChange={() => {}} />);
    escolherMetodo("pix");
    expect(parcelasVisiveis().length).toBeGreaterThan(0); // preview existe…
    expect(submitPayload().installment_dates).toEqual([]); // …e não viaja
  });

  it("o preview segue a REGRA (mesmo dia do mês), não o passo de 30 dias", () => {
    render(<ContractFormDialog open onOpenChange={() => {}} />);

    // Plano anual + DCC ⇒ 12 parcelas, o caso em que o +30 dias
    // escorregava o vencimento ao longo do ano.
    const selects = Array.from(document.querySelectorAll("select"));
    const selectPlano = selects.find((s) => s.querySelector('option[value="plan-1"]'));
    expect(selectPlano).toBeTruthy();
    fireEvent.change(selectPlano!, { target: { value: "plan-1" } });
    escolherMetodo("dcc");

    const datas = parcelasVisiveis().map((i) => i.value);
    expect(datas.length).toBeGreaterThan(1);

    const diaDaPrimeira = datas[0].slice(8, 10);
    for (const d of datas) {
      // Mesmo dia do mês em todas (ou último dia, quando o mês é curto).
      const [y, m, dia] = d.split("-").map(Number);
      const ultimoDiaDoMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
      expect(String(dia).padStart(2, "0")).toBe(
        Number(diaDaPrimeira) > ultimoDiaDoMes
          ? String(ultimoDiaDoMes).padStart(2, "0")
          : diaDaPrimeira,
      );
    }
  });

  it("COM edição manual: envia as datas escolhidas (precedência preservada)", () => {
    render(<ContractFormDialog open onOpenChange={() => {}} />);
    escolherMetodo("pix");
    const campos = parcelasVisiveis();
    expect(campos.length).toBeGreaterThan(0);

    fireEvent.change(campos[0], { target: { value: "2026-12-15" } });

    const enviadas = submitPayload().installment_dates as string[];
    expect(enviadas).toContain("2026-12-15");
  });
});
