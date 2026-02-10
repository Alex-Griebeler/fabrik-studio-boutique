import { useState } from "react";
import { Plus, Search, Users, Pencil } from "lucide-react";
import { format } from "date-fns";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StudentFormDialog } from "@/components/students/StudentFormDialog";
import {
  useStudents,
  useCreateStudent,
  useUpdateStudent,
  type Student,
  type StudentFormData,
} from "@/hooks/useStudents";

export default function Students() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const { data: students, isLoading } = useStudents(search, statusFilter);
  const createMutation = useCreateStudent();
  const updateMutation = useUpdateStudent();

  const handleCreate = () => {
    setEditingStudent(null);
    setDialogOpen(true);
  };

  const handleEdit = (student: Student) => {
    setEditingStudent(student);
    setDialogOpen(true);
  };

  const handleSubmit = (data: StudentFormData) => {
    if (editingStudent) {
      updateMutation.mutate(
        { id: editingStudent.id, data },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      createMutation.mutate(data, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Alunos"
        description="Gerencie todos os alunos cadastrados"
        actions={
          <Button className="font-semibold" onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Aluno
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !students?.length ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Users className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-sm font-medium">Nenhum aluno encontrado</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {search || statusFilter !== "all"
              ? "Tente ajustar os filtros"
              : "Comece adicionando seu primeiro aluno"}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Nome</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden sm:table-cell">Telefone</TableHead>
                <TableHead className="hidden lg:table-cell">Nascimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.id} className="group">
                  <TableCell className="font-medium">{student.full_name}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                    {student.email || "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                    {student.phone || "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                    {student.date_of_birth
                      ? format(new Date(student.date_of_birth + "T00:00:00"), "dd/MM/yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={student.is_active ? "default" : "secondary"}
                      className={
                        student.is_active
                          ? "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]"
                          : ""
                      }
                    >
                      {student.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleEdit(student)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Total */}
      {students && students.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {students.length} aluno{students.length !== 1 ? "s" : ""} encontrado{students.length !== 1 ? "s" : ""}
        </p>
      )}

      <StudentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        student={editingStudent}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
