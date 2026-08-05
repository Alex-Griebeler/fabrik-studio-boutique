export interface QualificationDetails {
  age_range?: string;
  profession?: string;
  objective?: string;
  location?: string;
  budget?: string;
  urgency?: string;
  has_trained_before?: boolean;
  preferred_time?: string;
}

export type LeadGrade = "A" | "B" | "C" | "D";

/**
 * Formato ANINHADO gravado pela Anamnese (link mágico) em
 * qualification_details — incompatível com os campos planos que o
 * calculateLeadScore espera (defeito pré-existente descoberto na
 * auditoria da Onda 1.5b: nota de anamnese preenchida virava sempre D).
 */
export interface AnamneseQualification {
  anamnese_preenchida?: boolean;
  anamnese_data?: string;
  dados_pessoais?: {
    nome?: string;
    telefone?: string;
    email?: string;
    idade?: string | number;
    profissao?: string;
  };
  perfil?: {
    como_conheceu?: string;
    busca_profissional?: string;
    onde_treina?: string;
    nota_condicao_fisica?: number;
    nota_satisfacao_corpo?: number;
  };
  treino?: {
    objetivos?: string[];
    frequencia_semanal?: string;
    periodo_treino?: string;
    maior_dificuldade?: string;
  };
  parq?: Record<string, boolean>;
}

export type AnyQualification = QualificationDetails | AnamneseQualification;

const HIGH_OBJECTIVES = ["performance", "saude", "saúde", "longevidade", "qualidade_vida"];

export function isAnamneseFormat(
  details: AnyQualification | undefined | null,
): details is AnamneseQualification {
  if (!details) return false;
  const d = details as AnamneseQualification;
  return Boolean(d.anamnese_preenchida || d.dados_pessoais || d.parq || d.treino);
}

function ageRangeFromIdade(idade: string | number | undefined): string | undefined {
  const n = typeof idade === "number" ? idade : parseInt(idade ?? "", 10);
  if (Number.isNaN(n)) return undefined;
  if (n < 30) return "18-29";
  if (n < 40) return "30-39";
  if (n <= 55) return "40-55";
  if (n <= 65) return "56-65";
  return "65+";
}

/**
 * Normaliza qualquer formato de qualification_details para os campos
 * planos que o calculateLeadScore entende. Formato plano passa direto;
 * formato de anamnese é mapeado (idade→faixa, profissão, objetivo
 * preferindo os de pontuação alta). Campos não coletados na anamnese
 * (location/budget/urgency) ficam undefined — teto prático ~70 pts (B).
 */
export function normalizeQualification(
  details: AnyQualification | undefined | null,
): QualificationDetails {
  if (!details) return {};
  if (!isAnamneseFormat(details)) return details as QualificationDetails;

  const objetivos = details.treino?.objetivos ?? [];
  const objective =
    objetivos.find((o) => HIGH_OBJECTIVES.includes(o)) ?? objetivos[0];

  return {
    age_range: ageRangeFromIdade(details.dados_pessoais?.idade),
    profession: details.dados_pessoais?.profissao,
    objective,
  };
}

export interface LeadScoreResult {
  score: number;
  grade: LeadGrade;
}

export function calculateLeadScore(details: QualificationDetails): LeadScoreResult {
  let score = 0;

  // Age range (40-55 = +25)
  if (details.age_range === "40-55") score += 25;
  else if (details.age_range === "30-39" || details.age_range === "56-65") score += 15;
  else if (details.age_range) score += 5;

  // Profession (executivo/empresario = +25)
  const premium = ["executivo", "empresario", "empresária", "diretor", "ceo"];
  if (details.profession && premium.some((p) => details.profession!.toLowerCase().includes(p))) {
    score += 25;
  } else if (details.profession) {
    score += 10;
  }

  // Objective (performance/saude/longevidade = +20)
  const highObj = ["performance", "saude", "saúde", "longevidade", "qualidade_vida"];
  if (details.objective && highObj.includes(details.objective)) {
    score += 20;
  } else if (details.objective) {
    score += 10;
  }

  // Location (Brasilia/DF = +15)
  const localHigh = ["brasilia", "brasília", "lago sul", "lago norte", "asa sul", "asa norte", "df"];
  if (details.location && localHigh.some((l) => details.location!.toLowerCase().includes(l))) {
    score += 15;
  } else if (details.location) {
    score += 5;
  }

  // Budget (premium = +10)
  if (details.budget === "premium" || details.budget === "alto") score += 10;
  else if (details.budget === "medio" || details.budget === "médio") score += 5;

  // Urgency (imediata = +5)
  if (details.urgency === "imediata" || details.urgency === "urgente") score += 5;
  else if (details.urgency === "proximos_30_dias") score += 3;

  // Cap at 100
  score = Math.min(score, 100);

  const grade: LeadGrade =
    score >= 75 ? "A" : score >= 50 ? "B" : score >= 25 ? "C" : "D";

  return { score, grade };
}

/**
 * Nota derivada da coluna `qualification_score` (já persistida e
 * recalculada a cada update) — permite que listas exibam a nota SEM
 * carregar o JSON `qualification_details`, que contém a ficha de saúde
 * (PAR-Q) do lead. Mesmos cortes do calculateLeadScore.
 */
export function gradeFromScore(score: number): LeadGrade {
  return score >= 75 ? "A" : score >= 50 ? "B" : score >= 25 ? "C" : "D";
}

export const gradeColors: Record<LeadGrade, string> = {
  A: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  B: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  C: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  D: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};
