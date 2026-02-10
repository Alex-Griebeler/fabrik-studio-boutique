import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface StudentAddress {
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip_code?: string;
}

export interface Student {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address: StudentAddress | null;
  medical_conditions: string | null;
  status: "lead" | "active" | "inactive" | "suspended";
  lead_source: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  is_active: boolean;
  profile_photo_url: string | null;
  created_at: string;
}

export interface StudentFormData {
  full_name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  date_of_birth?: string;
  gender?: string;
  address?: StudentAddress;
  medical_conditions?: string;
  status?: "lead" | "active" | "inactive" | "suspended";
  lead_source?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  notes?: string;
  is_active?: boolean;
}

export type StudentStatusFilter = "all" | "active" | "inactive" | "lead" | "suspended";

export function useStudents(search: string, statusFilter: StudentStatusFilter) {
  return useQuery({
    queryKey: ["students", search, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("*")
        .order("full_name", { ascending: true });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (search.trim()) query = query.ilike("full_name", `%${search.trim()}%`);

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Student[];
    },
  });
}

export function useCreateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: StudentFormData) => {
      const status = data.status ?? "active";
      const { error } = await supabase.from("students").insert({
        full_name: data.full_name,
        email: data.email || null,
        phone: data.phone || null,
        cpf: data.cpf || null,
        date_of_birth: data.date_of_birth || null,
        gender: data.gender || null,
        address: (data.address as any) || null,
        medical_conditions: data.medical_conditions || null,
        status,
        lead_source: data.lead_source || null,
        emergency_contact_name: data.emergency_contact_name || null,
        emergency_contact_phone: data.emergency_contact_phone || null,
        notes: data.notes || null,
        is_active: status === "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      toast.success("Aluno cadastrado com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao cadastrar aluno.");
    },
  });
}

export function useUpdateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: StudentFormData }) => {
      const status = data.status ?? "active";
      const { error } = await supabase.from("students").update({
        full_name: data.full_name,
        email: data.email || null,
        phone: data.phone || null,
        cpf: data.cpf || null,
        date_of_birth: data.date_of_birth || null,
        gender: data.gender || null,
        address: (data.address as any) || null,
        medical_conditions: data.medical_conditions || null,
        status,
        lead_source: data.lead_source || null,
        emergency_contact_name: data.emergency_contact_name || null,
        emergency_contact_phone: data.emergency_contact_phone || null,
        notes: data.notes || null,
        is_active: status === "active",
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      toast.success("Aluno atualizado com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao atualizar aluno.");
    },
  });
}
