import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "admin" | "manager" | "instructor" | "reception" | "student";

interface RolesState {
  userId: string | null;
  roles: AppRole[];
  loading: boolean;
  /** Falha ao buscar papéis — DIFERENTE de "sem papel" (telas podem avisar). */
  error: boolean;
}

/**
 * Papéis do usuário logado, AMARRADOS ao user.id (auditoria pós-merge
 * 04/08): na transição de usuário (login, troca de sessão) o estado
 * volta a loading=true até o resultado corresponder ao usuário atual —
 * sem isso, um render intermediário via roles=[] com loading=false e o
 * RoleHomeRedirect despachava o usuário para /sem-acesso antes dos
 * papéis chegarem.
 */
export function useUserRoles() {
  const { user } = useAuth();
  const [state, setState] = useState<RolesState>({
    userId: null,
    roles: [],
    loading: true,
    error: false,
  });

  useEffect(() => {
    if (!user) {
      setState({ userId: null, roles: [], loading: false, error: false });
      return;
    }

    let cancelled = false;

    // Usuário novo (ou primeiro login): zera papéis e volta a loading.
    // Mesmo usuário (refetch por mudança de identidade do objeto):
    // mantém os papéis atuais sem piscar loading.
    setState((s) =>
      s.userId === user.id ? s : { userId: user.id, roles: [], loading: true, error: false },
    );

    const fetchRoles = async () => {
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        if (error) throw error;
        if (!cancelled) {
          setState({
            userId: user.id,
            roles: (data || []).map((r) => r.role as AppRole),
            loading: false,
            error: false,
          });
        }
      } catch {
        if (!cancelled) {
          setState({ userId: user.id, roles: [], loading: false, error: true });
        }
      }
    };

    fetchRoles();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Retorno DERIVADO do usuário atual: no primeiro render após a troca
  // de usuário (antes do effect rodar), o estado ainda é do usuário
  // anterior — nunca devolver papéis dele (rodada final do Codex).
  const matchesUser = state.userId === (user?.id ?? null);
  const roles = matchesUser ? state.roles : [];
  const loading = !!user && (!matchesUser || state.loading);
  // Falha na BUSCA de papéis (≠ "sem papel"): telas podem avisar em vez
  // de degradar silenciosamente pra visão de menor privilégio.
  const error = matchesUser && state.error;

  const hasRole = (role: AppRole) => roles.includes(role);
  const hasAnyRole = (check: AppRole[]) => check.some((r) => roles.includes(r));

  return { roles, loading, error, hasRole, hasAnyRole };
}
