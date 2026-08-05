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
  const { roles, loading: rolesLoading, hasAnyRole } = useUserRoles();
  const location = useLocation();

  if (authLoading || rolesLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && allowedRoles.length > 0 && !hasAnyRole(allowedRoles)) {
    const home = homeRouteForRoles(roles);
    // Nunca redirecionar para a própria rota negada (evita loop em branco).
    if (home === location.pathname) return <Navigate to="/sem-acesso" replace />;
    return <Navigate to={home} replace />;
  }

  return <>{children}</>;
}
