import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { contractStatusLabels, paymentMethodLabels } from "@/hooks/useContracts";
import { format } from "date-fns";
import { InfoRow } from "./InfoRow";

function formatCurrency(cents: number | null): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

interface Contract {
  id: string;
  status: "active" | "suspended" | "cancelled" | "expired";
  start_date: string;
  end_date: string | null;
  monthly_value_cents: number | null;
  discount_cents: number | null;
  payment_method: string | null;
  payment_day: number | null;
  notes: string | null;
  plan?: { name: string } | null;
}

interface Props {
  contracts: Contract[] | undefined;
}

export function ContractTab({ contracts }: Props) {
  const activeContract = contracts?.find((c) => c.status === "active");

  return (
    <div className="space-y-4">
      {activeContract ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Contrato Ativo</CardTitle>
              <Badge variant="default">Ativo</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <InfoRow label="Plano" value={activeContract.plan?.name ?? "—"} />
            <InfoRow label="Início" value={format(new Date(activeContract.start_date), "dd/MM/yyyy")} />
            <InfoRow label="Término" value={activeContract.end_date ? format(new Date(activeContract.end_date), "dd/MM/yyyy") : "Indeterminado"} />
            <InfoRow label="Valor Mensal" value={formatCurrency(activeContract.monthly_value_cents)} />
            <InfoRow label="Forma de Pagamento" value={activeContract.payment_method ? paymentMethodLabels[activeContract.payment_method as keyof typeof paymentMethodLabels] : "—"} />
            <InfoRow label="Dia de Vencimento" value={activeContract.payment_day ? `Dia ${activeContract.payment_day}` : "—"} />
            {activeContract.discount_cents ? (
              <InfoRow label="Desconto" value={formatCurrency(activeContract.discount_cents)} />
            ) : null}
            {activeContract.notes && <InfoRow label="Observações" value={activeContract.notes} />}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
            <FileText className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhum contrato ativo</p>
          </CardContent>
        </Card>
      )}

      {contracts && contracts.length > (activeContract ? 1 : 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Histórico de Contratos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plano</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Término</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Valor Mensal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts
                  .filter((c) => c.id !== activeContract?.id)
                  .map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.plan?.name ?? "—"}</TableCell>
                      <TableCell>{format(new Date(c.start_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{c.end_date ? format(new Date(c.end_date), "dd/MM/yyyy") : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{contractStatusLabels[c.status]}</Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(c.monthly_value_cents)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
