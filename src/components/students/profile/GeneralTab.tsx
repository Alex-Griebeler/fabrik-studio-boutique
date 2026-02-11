import { User, Mail, Phone, MapPin, Heart, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { InfoRow } from "./InfoRow";
import type { Student } from "@/hooks/useStudents";

interface StudentAddress {
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip_code?: string;
}

interface Props {
  student: Student;
}

export function GeneralTab({ student }: Props) {
  const addr = student.address as StudentAddress | null;
  const hasAddress = addr && Object.values(addr).some((v) => v && String(v).trim());

  return (
    <div className="grid gap-4 md:grid-cols-2">
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Endereço
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {hasAddress && addr ? (
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
  );
}
