import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft, User, FileText, DollarSign, CalendarCheck, MessageCircle,
  Phone, Mail, MapPin, Heart, AlertTriangle, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useStudentById, useStudentContracts, useStudentInvoices, useStudentBookings } from "@/hooks/useStudentProfile";
import { contractStatusLabels, paymentMethodLabels } from "@/hooks/useContracts";
import { invoiceStatusLabels, invoiceStatusColors } from "@/hooks/useInvoices";
import { StudentFormDialog } from "@/components/students/StudentFormDialog";
import { useUpdateStudent, type StudentFormData } from "@/hooks/useStudents";
import { useState } from "react";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  lead: { label: "Lead", variant: "outline" },
  active: { label: "Ativo", variant: "default" },
  inactive: { label: "Inativo", variant: "secondary" },
  suspended: { label: "Suspenso", variant: "destructive" },
};

function formatCurrency(cents: number | null): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);

  const { data: student, isLoading } = useStudentById(id);
  const { data: contracts } = useStudentContracts(id);
  const { data: invoices } = useStudentInvoices(id);
  const { data: bookings } = useStudentBookings(id);
  const updateMutation = useUpdateStudent();

  const handleUpdate = (data: StudentFormData) => {
    if (!id) return;
    updateMutation.mutate({ id, data }, { onSuccess: () => setEditOpen(false) });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <User className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm font-medium">Aluno não encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/students")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
      </div>
    );
  }

  const sc = statusConfig[student.status] ?? statusConfig.active;
  const addr = student.address as any;
  const hasAddress = addr && Object.values(addr).some((v: any) => v && String(v).trim());
  const activeContract = contracts?.find((c) => c.status === "active");

  // Financial summary
  const totalPaid = invoices?.filter((i) => i.status === "paid").reduce((sum, i) => sum + (i.paid_amount_cents ?? i.amount_cents), 0) ?? 0;
  const totalPending = invoices?.filter((i) => i.status === "pending" || i.status === "overdue").reduce((sum, i) => sum + i.amount_cents, 0) ?? 0;
  const nextDue = invoices?.find((i) => i.status === "pending");

  // Attendance summary
  const confirmedBookings = bookings?.filter((b) => b.status === "confirmed") ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/students")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold truncate">{student.full_name}</h1>
            <Badge variant={sc.variant}>{sc.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cadastrado em {format(new Date(student.created_at), "dd/MM/yyyy")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-2 h-4 w-4" /> Editar
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
          <TabsTrigger value="general" className="gap-1.5">
            <User className="h-4 w-4 hidden sm:block" /> Geral
          </TabsTrigger>
          <TabsTrigger value="contract" className="gap-1.5">
            <FileText className="h-4 w-4 hidden sm:block" /> Contrato
          </TabsTrigger>
          <TabsTrigger value="financial" className="gap-1.5">
            <DollarSign className="h-4 w-4 hidden sm:block" /> Financeiro
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1.5">
            <CalendarCheck className="h-4 w-4 hidden sm:block" /> Presença
          </TabsTrigger>
          <TabsTrigger value="interactions" className="gap-1.5">
            <MessageCircle className="h-4 w-4 hidden sm:block" /> Interações
          </TabsTrigger>
        </TabsList>

        {/* TAB: Geral */}
        <TabsContent value="general" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Dados Pessoais */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" /> Dados Pessoais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow label="Email" value={student.email} icon={<Mail className="h-3.5 w-3.5" />} />
                <InfoRow label="Telefone" value={student.phone} icon={<Phone className="h-3.5 w-3.5" />} />
                <InfoRow label="CPF" value={student.cpf} />
                <InfoRow label="Nascimento" value={student.date_of_birth ? format(new Date(student.date_of_birth + "T00:00:00"), "dd/MM/yyyy") : null} />
                <InfoRow label="Gênero" value={student.gender === "male" ? "Masculino" : student.gender === "female" ? "Feminino" : student.gender === "other" ? "Outro" : null} />
                <InfoRow label="Origem" value={student.lead_source} />
              </CardContent>
            </Card>

            {/* Endereço */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" /> Endereço
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {hasAddress ? (
                  <p className="text-muted-foreground leading-relaxed">
                    {[addr.street, addr.number].filter(Boolean).join(", ")}
                    {addr.complement && ` - ${addr.complement}`}
                    <br />
                    {[addr.neighborhood, addr.city, addr.state].filter(Boolean).join(", ")}
                    {addr.zip_code && ` • CEP: ${addr.zip_code}`}
                  </p>
                ) : (
                  <p className="text-muted-foreground/60 italic">Endereço não cadastrado</p>
                )}
              </CardContent>
            </Card>

            {/* Saúde */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Heart className="h-4 w-4 text-primary" /> Saúde & Emergência
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Condições Médicas</p>
                  <p className={student.medical_conditions ? "text-foreground" : "text-muted-foreground/60 italic"}>
                    {student.medical_conditions || "Nenhuma registrada"}
                  </p>
                </div>
                <Separator />
                <InfoRow label="Contato de Emergência" value={student.emergency_contact_name} />
                <InfoRow label="Telefone Emergência" value={student.emergency_contact_phone} icon={<Phone className="h-3.5 w-3.5" />} />
              </CardContent>
            </Card>

            {/* Observações */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary" /> Observações
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className={student.notes ? "text-foreground whitespace-pre-wrap" : "text-muted-foreground/60 italic"}>
                  {student.notes || "Sem observações"}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: Contrato */}
        <TabsContent value="contract" className="space-y-4">
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
                <InfoRow label="Forma de Pagamento" value={activeContract.payment_method ? paymentMethodLabels[activeContract.payment_method] : "—"} />
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

          {/* Histórico de contratos */}
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
        </TabsContent>

        {/* TAB: Financeiro */}
        <TabsContent value="financial" className="space-y-4">
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Total Pago</p>
                <p className="text-xl font-bold text-success">{formatCurrency(totalPaid)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Em Aberto</p>
                <p className="text-xl font-bold text-destructive">{formatCurrency(totalPending)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Próximo Vencimento</p>
                <p className="text-xl font-bold">
                  {nextDue ? format(new Date(nextDue.due_date), "dd/MM/yyyy") : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Invoices table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Mensalidades</CardTitle>
            </CardHeader>
            <CardContent>
              {invoices && invoices.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês Ref.</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data Pgto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          {inv.reference_month
                            ? format(new Date(inv.reference_month), "MMM/yyyy", { locale: ptBR })
                            : "—"}
                        </TableCell>
                        <TableCell>{format(new Date(inv.due_date), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(inv.amount_cents)}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${invoiceStatusColors[inv.status]}`}>
                            {invoiceStatusLabels[inv.status]}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {inv.payment_date ? format(new Date(inv.payment_date), "dd/MM/yyyy") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center py-8 text-sm text-muted-foreground/60">Nenhuma mensalidade registrada</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Presença */}
        <TabsContent value="attendance" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Total de Aulas</p>
                <p className="text-xl font-bold">{confirmedBookings.length}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Últimas Aulas</CardTitle>
            </CardHeader>
            <CardContent>
              {confirmedBookings.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Horário</TableHead>
                      <TableHead>Modalidade</TableHead>
                      <TableHead>Instrutor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {confirmedBookings.map((b: any) => (
                      <TableRow key={b.id}>
                        <TableCell>
                          {b.session?.session_date
                            ? format(new Date(b.session.session_date), "dd/MM/yyyy")
                            : "—"}
                        </TableCell>
                        <TableCell>{b.session?.start_time?.slice(0, 5) ?? "—"}</TableCell>
                        <TableCell>{b.session?.modality ?? "—"}</TableCell>
                        <TableCell>{b.session?.instructor?.full_name ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center py-8 text-sm text-muted-foreground/60">Nenhuma presença registrada</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Interações */}
        <TabsContent value="interactions">
          <Card>
            <CardContent className="flex flex-col items-center py-16 text-muted-foreground">
              <MessageCircle className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Módulo de Interações</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Será implementado na Fase 3 — Leads e CRM
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <StudentFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        student={student}
        onSubmit={handleUpdate}
        isSubmitting={updateMutation.isPending}
      />
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: string | null | undefined; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={value ? "text-foreground" : "text-muted-foreground/60 italic"}>
          {value || "Não informado"}
        </p>
      </div>
    </div>
  );
}
