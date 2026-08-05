import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { SeoHead } from "@/components/SeoHead";

export default function NoAccess() {
  const { signOut } = useAuth();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <SeoHead title="Acesso pendente" description="Sua conta ainda não possui permissões no sistema Fabrik." path="/sem-acesso" noindex />
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight">Acesso pendente</h1>
        <p className="text-sm text-muted-foreground">
          Sua conta foi criada, mas ainda não possui um perfil de acesso liberado.
          Fale com a administração do studio para liberar suas permissões.
        </p>
        <Button variant="outline" className="w-full h-11" onClick={() => signOut()}>
          Sair
        </Button>
      </div>
    </main>
  );
}
