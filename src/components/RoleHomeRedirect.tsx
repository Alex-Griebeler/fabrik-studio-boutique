import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useHomeRoute } from "@/hooks/useHomeRoute";

/**
 * Redireciona a raiz "/" para a área inicial correta de cada papel.
 */
export function RoleHomeRedirect() {
  const { user, loading: authLoading } = useAuth();
  const { homeRoute, loading: rolesLoading } = useHomeRoute();

  if (authLoading || rolesLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <Navigate to={homeRoute} replace />;
}
