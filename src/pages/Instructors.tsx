import { useState } from "react";
import { GraduationCap, Plus, Phone, Mail, Calendar, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useInstructorProfiles,
  useAllProfiles,
  useAddInstructorRole,
  useRemoveInstructorRole,
  useInstructorSessionStats,
} from "@/hooks/useInstructors";

function InstructorCard({ instructor }: { instructor: any }) {
  const [showRemove, setShowRemove] = useState(false);
  const removeRole = useRemoveInstructorRole();
  const { data: stats } = useInstructorSessionStats(instructor.id);

  const initials = instructor.full_name
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-sm truncate">{instructor.full_name}</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => setShowRemove(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="space-y-1 mt-1.5">
                {instructor.email && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Mail className="h-3 w-3" /> {instructor.email}
                  </p>
                )}
                {instructor.phone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Phone className="h-3 w-3" /> {instructor.phone}
                  </p>
                )}
              </div>
              {stats && (
                <div className="flex gap-2 mt-2">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    <Calendar className="h-3 w-3 mr-0.5" />
                    {stats.upcomingCount} próximas
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {stats.pastWeekCount} última semana
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showRemove} onOpenChange={setShowRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover instrutor?</AlertDialogTitle>
            <AlertDialogDescription>
              {instructor.full_name} perderá o papel de instrutor. Aulas já atribuídas não serão afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => removeRole.mutate(instructor.auth_user_id)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function Instructors() {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");

  const { data: instructors, isLoading } = useInstructorProfiles();
  const { data: allProfiles } = useAllProfiles();
  const addRole = useAddInstructorRole();

  // Filter out users who are already instructors
  const instructorAuthIds = new Set(instructors?.map((i) => i.auth_user_id) ?? []);
  const availableProfiles = allProfiles?.filter((p) => !instructorAuthIds.has(p.auth_user_id)) ?? [];

  const handleAdd = () => {
    if (!selectedUserId) return;
    addRole.mutate(selectedUserId, {
      onSuccess: () => {
        setSelectedUserId("");
        setShowAdd(false);
      },
    });
  };

  return (
    <div>
      <PageHeader
        title="Instrutores"
        description="Gestão de treinadores e professores"
        actions={
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar Instrutor
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <GraduationCap className="h-8 w-8 animate-pulse mr-2" />
          <span className="text-sm">Carregando instrutores...</span>
        </div>
      ) : !instructors?.length ? (
        <div className="text-center py-16 space-y-2">
          <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Nenhum instrutor cadastrado</p>
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar primeiro instrutor
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {instructors.map((instructor) => (
            <InstructorCard key={instructor.id} instructor={instructor} />
          ))}
        </div>
      )}

      {/* Add instructor dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar Instrutor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione um usuário existente para atribuir o papel de instrutor.
            </p>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um usuário" />
              </SelectTrigger>
              <SelectContent>
                {availableProfiles.map((p) => (
                  <SelectItem key={p.auth_user_id} value={p.auth_user_id}>
                    {p.full_name} {p.email ? `(${p.email})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAdd(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAdd} disabled={!selectedUserId || addRole.isPending}>
                {addRole.isPending ? "Adicionando..." : "Adicionar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
