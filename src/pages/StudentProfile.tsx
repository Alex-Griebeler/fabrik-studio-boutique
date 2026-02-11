import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, User, FileText, DollarSign, CalendarCheck, MessageCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudentById, useStudentContracts, useStudentInvoices, useStudentBookings } from "@/hooks/useStudentProfile";
import { StudentFormDialog } from "@/components/students/StudentFormDialog";
import { useUpdateStudent, type StudentFormData } from "@/hooks/useStudents";
import { GeneralTab } from "@/components/students/profile/GeneralTab";
import { ContractTab } from "@/components/students/profile/ContractTab";
import { FinancialTab } from "@/components/students/profile/FinancialTab";
import { AttendanceTab } from "@/components/students/profile/AttendanceTab";
import { useState } from "react";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  lead: { label: "Lead", variant: "outline" },
  active: { label: "Ativo", variant: "default" },
  inactive: { label: "Inativo", variant: "secondary" },
  suspended: { label: "Suspenso", variant: "destructive" },
};

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

        <TabsContent value="general">
          <GeneralTab student={student} />
        </TabsContent>

        <TabsContent value="contract">
          <ContractTab contracts={contracts} />
        </TabsContent>

        <TabsContent value="financial">
          <FinancialTab invoices={invoices} />
        </TabsContent>

        <TabsContent value="attendance">
          <AttendanceTab bookings={bookings} />
        </TabsContent>

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
