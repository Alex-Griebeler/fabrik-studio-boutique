// Conversão centavos ↔ "R$ em texto" das telas de tarifa (RatesTab e
// TrainerFormDialog importam DAQUI — fonte única; duas telas aceitando a
// mesma digitação e gravando centavos diferentes é bug de folha).

export function centsToReal(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Texto em R$ → centavos, ESTRITO: dígitos + separador decimal opcional
 * (vírgula OU ponto) com 1–2 casas. Qualquer outra coisa → NaN e o
 * chamador aborta com erro visível.
 *
 * Estrito de propósito: separador de milhar é AMBÍGUO ("1.234" seria
 * R$ 1.234,00 ou R$ 1,234 arredondado?) e ambiguidade aqui vira folha
 * errada. Quem quer mil e duzentos digita 1234.
 */
export function realToCents(input: string): number {
  const trimmed = input.trim();
  if (!/^\d+([.,]\d{1,2})?$/.test(trimmed)) return NaN;
  const value = Number(trimmed.replace(",", "."));
  return Math.round(value * 100);
}
