import { describe, expect, it } from "vitest";
import {
  calculateLeadScore,
  gradeFromScore,
  isAnamneseFormat,
  normalizeQualification,
  type AnamneseQualification,
} from "./leadScoring";

describe("gradeFromScore — fronteiras exatas", () => {
  it("A a partir de 75", () => {
    expect(gradeFromScore(75)).toBe("A");
    expect(gradeFromScore(100)).toBe("A");
    expect(gradeFromScore(74)).toBe("B");
  });
  it("B a partir de 50", () => {
    expect(gradeFromScore(50)).toBe("B");
    expect(gradeFromScore(49)).toBe("C");
  });
  it("C a partir de 25", () => {
    expect(gradeFromScore(25)).toBe("C");
    expect(gradeFromScore(24)).toBe("D");
    expect(gradeFromScore(0)).toBe("D");
  });

  it("bate com o grade do calculateLeadScore para o mesmo score", () => {
    const flat = { age_range: "40-55", profession: "empresario", objective: "performance" };
    const { score, grade } = calculateLeadScore(flat);
    expect(gradeFromScore(score)).toBe(grade);
  });
});

describe("normalizeQualification", () => {
  // Valores LITERAIS da UI real da Anamnese (OBJETIVOS em Anamnese.tsx)
  const anamnese: AnamneseQualification = {
    anamnese_preenchida: true,
    dados_pessoais: { nome: "Teste", idade: "47", profissao: "Empresária" },
    treino: {
      objetivos: ["Emagrecimento", "Saúde, qualidade de vida e longevidade"],
      frequencia_semanal: ["3x", "4x"],
    },
    parq: { problema_cardiaco: false, dor_peito_exercicio: true },
  };

  it("detecta o formato aninhado da anamnese", () => {
    expect(isAnamneseFormat(anamnese)).toBe(true);
    expect(isAnamneseFormat({ age_range: "30-39" })).toBe(false);
    expect(isAnamneseFormat(undefined)).toBe(false);
  });

  it("mapeia idade→faixa, profissão e objetivo com os RÓTULOS reais da UI", () => {
    const flat = normalizeQualification(anamnese);
    expect(flat.age_range).toBe("40-55");
    expect(flat.profession).toBe("Empresária");
    // "Saúde, qualidade de vida e longevidade" → canônico de alta pontuação
    expect(["longevidade", "qualidade_vida", "saude"]).toContain(flat.objective);
  });

  it("rótulo real 'Performance' vira canônico e pontua alto (20)", () => {
    const flat = normalizeQualification({
      anamnese_preenchida: true,
      treino: { objetivos: ["Performance"] },
    });
    expect(flat.objective).toBe("performance");
  });

  it("objetivo sem canônico (ex. 'Hipertrofia') passa cru e pontua como outro", () => {
    const flat = normalizeQualification({
      anamnese_preenchida: true,
      treino: { objetivos: ["Hipertrofia"] },
    });
    expect(flat.objective).toBe("Hipertrofia");
    const { score } = calculateLeadScore(flat);
    expect(score).toBe(10); // objetivo genérico
  });

  it("anamnese preenchida NÃO vira nota zero (defeito pré-existente corrigido)", () => {
    const { score, grade } = calculateLeadScore(normalizeQualification(anamnese));
    // idade 40-55 (+25) + profissão premium (+25) + objetivo alto (+20)
    expect(score).toBe(70);
    expect(grade).toBe("B");
  });

  it("formato plano passa direto, sem alteração", () => {
    const flat = { age_range: "30-39", profession: "advogada", objective: "estetica" };
    expect(normalizeQualification(flat)).toEqual(flat);
  });

  it("faixas etárias nas fronteiras", () => {
    expect(normalizeQualification({ anamnese_preenchida: true, dados_pessoais: { idade: 29 } }).age_range).toBe("18-29");
    expect(normalizeQualification({ anamnese_preenchida: true, dados_pessoais: { idade: 30 } }).age_range).toBe("30-39");
    expect(normalizeQualification({ anamnese_preenchida: true, dados_pessoais: { idade: 55 } }).age_range).toBe("40-55");
    expect(normalizeQualification({ anamnese_preenchida: true, dados_pessoais: { idade: 56 } }).age_range).toBe("56-65");
    expect(normalizeQualification({ anamnese_preenchida: true, dados_pessoais: { idade: 70 } }).age_range).toBe("65+");
    expect(normalizeQualification({ anamnese_preenchida: true, dados_pessoais: { idade: "abc" } }).age_range).toBeUndefined();
  });

  it("vazio/nulo vira objeto vazio (nota D, sem lançar)", () => {
    expect(normalizeQualification(undefined)).toEqual({});
    expect(calculateLeadScore(normalizeQualification(null)).grade).toBe("D");
  });
});
