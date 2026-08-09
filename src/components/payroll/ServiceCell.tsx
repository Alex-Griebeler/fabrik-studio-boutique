import { Badge } from "@/components/ui/badge";

// Célula de SERVIÇO da folha (PR-D) — fonte única das duas telas
// (Folha Pagto e Minha Folha):
// - nome do serviço vem do catálogo (via view payable_sessions);
// - linha LEGADA (anterior às tarifas por serviço) não tem service_name →
//   cai no formato antigo (group/personal), sem inventar classificação;
// - base per_session ganha o marcador "R$/sessão" (o valor é cravado,
//   não é horas × tarifa — sem o marcador, "1.0h · R$108" parece erro).
interface Props {
  serviceName: string | null | undefined;
  sessionType: string;
  paymentRateBasis: string | null | undefined;
}

export function ServiceCell({ serviceName, sessionType, paymentRateBasis }: Props) {
  return (
    <div className="flex items-center gap-1">
      <Badge variant="outline" className="text-xs capitalize">
        {serviceName ?? sessionType}
      </Badge>
      {paymentRateBasis === "per_session" && (
        <Badge variant="secondary" className="text-[10px]">
          R$/sessão
        </Badge>
      )}
    </div>
  );
}
