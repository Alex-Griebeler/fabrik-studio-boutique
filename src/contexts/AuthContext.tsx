import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { toast } from "sonner";

// IMPORTANTE — `signUp` foi removido propositalmente do contexto.
// O app é administrativo e self-signup público criava conta com role
// `admin` por default (via trigger `handle_new_user`). Acesso novo é
// criado pela administração inserindo manualmente em `user_roles` após
// um convite/criação de usuário fora do app. Se um dia precisar
// reintroduzir, faça via fluxo admin-only (não na UI pública).

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : error.message);
      }
      return { error: error as Error | null };
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Erro inesperado ao fazer login");
      toast.error(error.message);
      return { error };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      toast.error("Erro ao sair da conta.");
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("E-mail de recuperação enviado!");
      }
      return { error: error as Error | null };
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Erro ao enviar e-mail de recuperação");
      toast.error(error.message);
      return { error };
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
