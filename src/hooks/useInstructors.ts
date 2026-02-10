import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Instructor {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  auth_user_id: string;
  created_at: string;
}

export function useInstructorProfiles() {
  return useQuery({
    queryKey: ["instructor_profiles"],
    queryFn: async () => {
      // Get user_ids with instructor role
      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "instructor");
      if (rErr) throw rErr;

      if (!roles?.length) return [];

      const instructorUserIds = roles.map((r) => r.user_id);

      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("*")
        .in("auth_user_id", instructorUserIds)
        .order("full_name");
      if (pErr) throw pErr;

      return profiles as unknown as Instructor[];
    },
  });
}

export function useAllProfiles() {
  return useQuery({
    queryKey: ["all_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("full_name");
      if (error) throw error;
      return data as unknown as Instructor[];
    },
  });
}

export function useAddInstructorRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("user_roles").insert({
        user_id: userId,
        role: "instructor" as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instructor_profiles"] });
      qc.invalidateQueries({ queryKey: ["instructors"] });
      toast.success("Instrutor adicionado!");
    },
    onError: (e: any) => {
      if (e?.message?.includes("duplicate")) toast.error("Usuário já é instrutor.");
      else toast.error("Erro ao adicionar instrutor.");
    },
  });
}

export function useRemoveInstructorRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "instructor" as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instructor_profiles"] });
      qc.invalidateQueries({ queryKey: ["instructors"] });
      toast.success("Papel de instrutor removido!");
    },
    onError: () => toast.error("Erro ao remover instrutor."),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { full_name?: string; phone?: string | null; email?: string | null } }) => {
      const { error } = await supabase.from("profiles").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instructor_profiles"] });
      qc.invalidateQueries({ queryKey: ["all_profiles"] });
      qc.invalidateQueries({ queryKey: ["instructors"] });
      toast.success("Perfil atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar perfil."),
  });
}

// Instructor schedule stats
export function useInstructorSessionStats(profileId: string | undefined) {
  return useQuery({
    queryKey: ["instructor_session_stats", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

      const { data: upcoming, error: e1 } = await supabase
        .from("class_sessions")
        .select("id")
        .eq("instructor_id", profileId!)
        .gte("session_date", today)
        .neq("status", "cancelled");

      const { data: past, error: e2 } = await supabase
        .from("class_sessions")
        .select("id")
        .eq("instructor_id", profileId!)
        .gte("session_date", weekAgo)
        .lt("session_date", today)
        .neq("status", "cancelled");

      if (e1) throw e1;
      if (e2) throw e2;

      return {
        upcomingCount: upcoming?.length ?? 0,
        pastWeekCount: past?.length ?? 0,
      };
    },
  });
}
