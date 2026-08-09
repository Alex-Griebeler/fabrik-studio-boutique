// Célula de serviço da folha (PR-D): o que não pode regredir é a
// HONESTIDADE da exibição — legado cai no formato antigo (nunca
// classificação inventada) e per_session é marcado (valor cravado,
// não horas × tarifa).
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServiceCell } from "./ServiceCell";

describe("ServiceCell", () => {
  it("mostra o nome do serviço do catálogo", () => {
    render(<ServiceCell serviceName="Fisioterapia" sessionType="personal" paymentRateBasis="per_session" />);
    expect(screen.getByText("Fisioterapia")).toBeInTheDocument();
  });

  it("per_session ganha o marcador R$/sessão", () => {
    render(<ServiceCell serviceName="Fisioterapia" sessionType="personal" paymentRateBasis="per_session" />);
    expect(screen.getByText("R$/sessão")).toBeInTheDocument();
  });

  it("hourly NÃO ganha marcador", () => {
    render(<ServiceCell serviceName="Grupo" sessionType="group" paymentRateBasis="hourly" />);
    expect(screen.queryByText("R$/sessão")).toBeNull();
  });

  it("linha legada (sem serviço/base) cai no formato antigo, sem inventar", () => {
    render(<ServiceCell serviceName={null} sessionType="group" paymentRateBasis={null} />);
    expect(screen.getByText("group")).toBeInTheDocument();
    expect(screen.queryByText("R$/sessão")).toBeNull();
  });
});
