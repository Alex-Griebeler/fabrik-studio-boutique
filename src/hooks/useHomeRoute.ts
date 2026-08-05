import { useUserRoles, type AppRole } from "@/hooks/useUserRoles";

/**
 * Rota inicial de cada papel. Evita mandar instrutor/aluno para /dashboard
 * (rota restrita a admin/manager/reception), o que causava loop de redirect.
 */
export function homeRouteForRoles(roles: AppRole[]): string {
  if (roles.some((r) => r === "admin" || r === "manager" || r === "reception")) {
    return "/dashboard";
  }
  if (roles.includes("instructor")) return "/trainer-app";
  if (roles.includes("student")) return "/student-app";
  return "/sem-acesso";
}

export function useHomeRoute() {
  const { roles, loading } = useUserRoles();
  return { homeRoute: homeRouteForRoles(roles), loading };
}
