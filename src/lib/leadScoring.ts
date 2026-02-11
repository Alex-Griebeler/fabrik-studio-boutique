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

export const gradeColors: Record<LeadGrade, string> = {
  A: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  B: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  C: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  D: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};
