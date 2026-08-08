// Conversão centavos ↔ "R$ em texto" usada nas telas de tarifa.
// Mesma semântica dos conversores locais do TrainerFormDialog (que ficam lá
// até a PR-C aposentar os campos legados).

export function centsToReal(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Texto em R$ → centavos. Aceita os dois hábitos de digitação:
 *  - com vírgula decimal ("75,00", "1.234,56" — ponto é milhar)
 *  - com ponto decimal ("75.00", "75.5" — sem vírgula, ponto é decimal)
 * Vazio ou não-numérico → NaN (o chamador decide o que é erro; 0 é parse
 * válido, mas tarifa inválida — a regra rate_cents > 0 é do banco e da tela).
 */
export function realToCents(input: string): number {
  const trimmed = input.trim();
  if (trimmed === "") return NaN;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value * 100);
}
