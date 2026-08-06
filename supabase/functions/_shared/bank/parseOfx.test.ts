import { describe, expect, it, vi, afterEach } from "vitest";
import { parseOFX } from "./parseOfx";

/**
 * Teste de INTEGRAÇÃO do parser (exigência da auditoria da Onda 2e):
 * o teste de unidade do helper não pegaria alguém trocando o tipo
 * canônico pelo cru na hora de montar a transação.
 *
 * O arquivo abaixo reproduz os lançamentos REAIS de 04/03/2026 que
 * viraram despesa-lixo em produção.
 */
const OFX_REAL = `
OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>001</BANKID><ACCTID>12345-6</ACCTID></BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260201</DTSTART><DTEND>20260228</DTEND>
<STMTTRN><TRNTYPE>DEP</TRNTYPE><DTPOSTED>20260210120000</DTPOSTED><TRNAMT>10000.00</TRNAMT><FITID>A1</FITID><MEMO>DEP DINHEIRO INTER AG</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>XFER</TRNTYPE><DTPOSTED>20260206120000</DTPOSTED><TRNAMT>1400.00</TRNAMT><FITID>A2</FITID><MEMO>PIX - RECEBIDO - 06/02 TARCISIO</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>OTHER</TRNTYPE><DTPOSTED>20260215120000</DTPOSTED><TRNAMT>3296.84</TRNAMT><FITID>A3</FITID><MEMO>ESTORNO DE DEBITO</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>INT</TRNTYPE><DTPOSTED>20260216120000</DTPOSTED><TRNAMT>15.34</TRNAMT><FITID>A4</FITID><MEMO>DEVOLUCAO JUROS-LIM ESP</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>XFER</TRNTYPE><DTPOSTED>20260220152400</DTPOSTED><TRNAMT>-938.00</TRNAMT><FITID>A5</FITID><MEMO>PIX - ENVIADO - 20/02 LUCIANA</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>FEE</TRNTYPE><DTPOSTED>20260225120000</DTPOSTED><TRNAMT>-81.40</TRNAMT><FITID>A6</FITID><MEMO>TARIFA PACOTE DE SERVICOS</MEMO></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
`;

afterEach(() => vi.restoreAllMocks());

describe("parseOFX — integração com os lançamentos reais de 04/03/2026", () => {
  const parsed = parseOFX(OFX_REAL);
  const byId = Object.fromEntries(parsed.transactions.map((t) => [t.fitId, t]));

  it("lê metadados e todas as transações", () => {
    expect(parsed.bankId).toBe("001");
    expect(parsed.periodStart).toBe("2026-02-01");
    expect(parsed.periodEnd).toBe("2026-02-28");
    expect(parsed.transactions).toHaveLength(6);
  });

  it("as 4 ENTRADAS que viraram despesa agora são CREDIT", () => {
    expect(byId.A1.trnType).toBe("CREDIT"); // depósito R$10.000
    expect(byId.A2.trnType).toBe("CREDIT"); // PIX recebido
    expect(byId.A3.trnType).toBe("CREDIT"); // estorno
    expect(byId.A4.trnType).toBe("CREDIT"); // devolução de juros
  });

  it("as saídas continuam DEBIT", () => {
    expect(byId.A5.trnType).toBe("DEBIT"); // PIX enviado
    expect(byId.A6.trnType).toBe("DEBIT"); // tarifa
  });

  it("NENHUMA entrada de dinheiro é elegível a virar despesa", () => {
    const debitos = parsed.transactions.filter((t) => t.trnType === "DEBIT");
    expect(debitos).toHaveLength(2);
    expect(debitos.every((t) => t.trnAmt < 0)).toBe(true);
  });

  it("preserva valor com sinal, data e memo", () => {
    expect(byId.A1.trnAmt).toBe(10000);
    expect(byId.A5.trnAmt).toBe(-938);
    expect(byId.A1.dtPosted).toBe("2026-02-10");
    expect(byId.A5.memo).toContain("PIX - ENVIADO");
  });

  it("o tipo cru do banco NÃO vaza para o resultado", () => {
    const crus = ["DEP", "XFER", "OTHER", "INT", "FEE"];
    for (const t of parsed.transactions) {
      expect(crus).not.toContain(t.trnType);
      expect(["CREDIT", "DEBIT"]).toContain(t.trnType);
    }
  });
});

describe("parseOFX — robustez", () => {
  it("descarta transação com TRNAMT ilegível em vez de gravar NaN", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ofx = `<OFX><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260210120000</DTPOSTED><TRNAMT>N/A</TRNAMT><FITID>X1</FITID><MEMO>lixo</MEMO></STMTTRN></OFX>`;
    const parsed = parseOFX(ofx);
    expect(parsed.transactions).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
  });

  it("ignora bloco sem campos obrigatórios", () => {
    const ofx = `<OFX><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><MEMO>sem data nem valor</MEMO></STMTTRN></OFX>`;
    expect(parseOFX(ofx).transactions).toHaveLength(0);
  });

  it("arquivo vazio não quebra", () => {
    expect(parseOFX("").transactions).toHaveLength(0);
  });
});
