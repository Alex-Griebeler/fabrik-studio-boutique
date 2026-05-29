// Helper mínimo e puro pra resolver o provider de um SID já gravado em
// `attendance_alerts`. Extraído pra cá pra ser testável isoladamente
// (vitest) e reusável entre edge functions.
//
// Regra: a coluna `*_provider` vence quando preenchida; senão infere
// pelo prefixo do SID (`wamid.` = Meta Cloud, qualquer outro = Twilio
// `SM...`). Mantém compat com linhas antigas onde a coluna ainda é null.

export function providerForSid(
  column: string | null | undefined,
  sid: string,
): "twilio" | "meta" {
  if (column === "meta") return "meta";
  if (column === "twilio") return "twilio";
  return sid.startsWith("wamid.") ? "meta" : "twilio";
}
