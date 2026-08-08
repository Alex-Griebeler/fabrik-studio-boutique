import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRoles, type AppRole } from "@/hooks/useUserRoles";
import { homeRouteForRoles } from "@/hooks/useHomeRoute";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { roles, loading: rolesLoading, error: rolesError, hasAnyRole } = useUserRoles();
  const location = useLocation();

  if (authLoading || rolesLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Falha ao BUSCAR papéis ≠ "sem papel": redirecionar aqui mandaria um
  // admin legítimo pro /sem-acesso por um soluço de rede. Fail-visible.
  if (rolesError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-sm text-destructive">
          Não foi possível confirmar seu papel de acesso.
        </p>
        <button
          className="text-sm underline text-muted-foreground"
          onClick={() => window.location.reload()}
        >
          Recarregar
        </button>
      </div>
    );
  }

  if (allowedRoles && allowedRoles.length > 0 && !hasAnyRole(allowedRoles)) {
    const home = homeRouteForRoles(roles);
    // Nunca redirecionar para a própria rota negada (evita loop em branco).
    if (home === location.pathname) return <Navigate to="/sem-acesso" replace />;
    return <Navigate to={home} replace />;
  }

  return <>{children}</>;
}
