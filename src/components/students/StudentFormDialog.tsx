import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Student, StudentFormData } from "@/hooks/useStudents";

const addressSchema = z.object({
  street: z.string().trim().max(200).optional().default(""),
  number: z.string().trim().max(10).optional().default(""),
  complement: z.string().trim().max(100).optional().default(""),
  neighborhood: z.string().trim().max(100).optional().default(""),
  city: z.string().trim().max(100).optional().default(""),
  state: z.string().trim().max(2).optional().default(""),
  zip_code: z.string().trim().max(10).optional().default(""),
});

const studentSchema = z.object({
  full_name: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").max(120),
  email: z.string().trim().email("Email inválido").max(255).or(z.literal("")),
  phone: z.string().trim().max(20).or(z.literal("")),
  cpf: z.string().trim().max(14).or(z.literal("")),
  date_of_birth: z.date().optional(),
  gender: z.string().optional().default(""),
  status: z.enum(["lead", "active", "inactive", "suspended"]).default("active"),
  lead_source: z.string().trim().max(100).optional().default(""),
  medical_conditions: z.string().trim().max(1000).optional().default(""),
  address: addressSchema.optional().default({}),
  emergency_contact_name: z.string().trim().max(120).or(z.literal("")),
  emergency_contact_phone: z.string().trim().max(20).or(z.literal("")),
  notes: z.string().trim().max(500).or(z.literal("")),
});

type FormValues = z.infer<typeof studentSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student?: Student | null;
  onSubmit: (data: StudentFormData) => void;
  isSubmitting: boolean;
}

const emptyDefaults: FormValues = {
  full_name: "",
  email: "",
  phone: "",
  cpf: "",
  date_of_birth: undefined,
  gender: "",
  status: "active",
  lead_source: "",
  medical_conditions: "",
  address: { street: "", number: "", complement: "", neighborhood: "", city: "", state: "", zip_code: "" },
  emergency_contact_name: "",
  emergency_contact_phone: "",
  notes: "",
};

const statusLabels: Record<string, string> = {
  lead: "Lead",
  active: "Ativo",
  inactive: "Inativo",
  suspended: "Suspenso",
};

const genderOptions = [
  { value: "male", label: "Masculino" },
  { value: "female", label: "Feminino" },
  { value: "other", label: "Outro" },
];

export function StudentFormDialog({ open, onOpenChange, student, onSubmit, isSubmitting }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: emptyDefaults,
  });

  useEffect(() => {
    if (student) {
      const addr = (student.address as Record<string, string> | null) ?? {};
      form.reset({
        full_name: student.full_name,
        email: student.email ?? "",
        phone: student.phone ?? "",
        cpf: student.cpf ?? "",
        date_of_birth: student.date_of_birth ? new Date(student.date_of_birth + "T00:00:00") : undefined,
        gender: student.gender ?? "",
        status: student.status ?? "active",
        lead_source: student.lead_source ?? "",
        medical_conditions: student.medical_conditions ?? "",
        address: {
          street: addr.street ?? "",
          number: addr.number ?? "",
          complement: addr.complement ?? "",
          neighborhood: addr.neighborhood ?? "",
          city: addr.city ?? "",
          state: addr.state ?? "",
          zip_code: addr.zip_code ?? "",
        },
        emergency_contact_name: student.emergency_contact_name ?? "",
        emergency_contact_phone: student.emergency_contact_phone ?? "",
        notes: student.notes ?? "",
      });
    } else {
      form.reset(emptyDefaults);
    }
  }, [student, open, form]);

  const handleSubmit = (values: FormValues) => {
    const addr = values.address;
    const hasAddress = addr && Object.values(addr).some((v) => v && v.trim());
    onSubmit({
      full_name: values.full_name,
      email: values.email || undefined,
      phone: values.phone || undefined,
      cpf: values.cpf || undefined,
      date_of_birth: values.date_of_birth ? format(values.date_of_birth, "yyyy-MM-dd") : undefined,
      gender: values.gender || undefined,
      status: values.status,
      lead_source: values.lead_source || undefined,
      medical_conditions: values.medical_conditions || undefined,
      address: hasAddress ? addr : undefined,
      emergency_contact_name: values.emergency_contact_name || undefined,
      emergency_contact_phone: values.emergency_contact_phone || undefined,
      notes: values.notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {student ? "Editar Aluno" : "Novo Aluno"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
            {/* Dados Pessoais */}
            <section className="space-y-4">
              <p className="text-sm font-semibold text-foreground">Dados Pessoais</p>

              <FormField control={form.control} name="full_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Completo *</FormLabel>
                  <FormControl><Input placeholder="Nome do aluno" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" placeholder="email@exemplo.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl><Input placeholder="(00) 00000-0000" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="cpf" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF</FormLabel>
                    <FormControl><Input placeholder="000.000.000-00" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField control={form.control} name="date_of_birth" render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data de Nascimento</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, "dd/MM/yyyy") : "Selecionar"}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} captionLayout="dropdown-buttons" fromYear={1920} toYear={new Date().getFullYear()} disabled={(date) => date > new Date() || date < new Date("1900-01-01")} locale={ptBR} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="gender" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gênero</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {genderOptions.map((g) => (
                          <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(statusLabels).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </section>

            {/* Endereço */}
            <section className="space-y-4 border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground">Endereço</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField control={form.control} name="address.street" render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Rua</FormLabel>
                    <FormControl><Input placeholder="Rua / Av." {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="address.number" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número</FormLabel>
                    <FormControl><Input placeholder="Nº" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <FormField control={form.control} name="address.complement" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Complemento</FormLabel>
                    <FormControl><Input placeholder="Apto, Bloco" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="address.neighborhood" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bairro</FormLabel>
                    <FormControl><Input placeholder="Bairro" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="address.city" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl><Input placeholder="Cidade" {...field} /></FormControl>
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="address.state" render={({ field }) => (
                    <FormItem>
                      <FormLabel>UF</FormLabel>
                      <FormControl><Input placeholder="RS" maxLength={2} {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="address.zip_code" render={({ field }) => (
                    <FormItem>
                      <FormLabel>CEP</FormLabel>
                      <FormControl><Input placeholder="00000-000" {...field} /></FormControl>
                    </FormItem>
                  )} />
                </div>
              </div>
            </section>

            {/* Saúde & Emergência */}
            <section className="space-y-4 border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground">Saúde & Emergência</p>
              <FormField control={form.control} name="medical_conditions" render={({ field }) => (
                <FormItem>
                  <FormLabel>Condições Médicas / Restrições</FormLabel>
                  <FormControl><Textarea placeholder="Lesões, alergias, restrições de exercício..." rows={2} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="emergency_contact_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contato de Emergência</FormLabel>
                    <FormControl><Input placeholder="Nome do contato" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="emergency_contact_phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone Emergência</FormLabel>
                    <FormControl><Input placeholder="(00) 00000-0000" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </section>

            {/* Origem & Observações */}
            <section className="space-y-4 border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground">Origem & Observações</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="lead_source" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Origem do Lead</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="google">Google</SelectItem>
                        <SelectItem value="indicacao">Indicação</SelectItem>
                        <SelectItem value="passando_na_frente">Passando na frente</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl><Textarea placeholder="Observações sobre o aluno" rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </section>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : student ? "Salvar" : "Cadastrar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
