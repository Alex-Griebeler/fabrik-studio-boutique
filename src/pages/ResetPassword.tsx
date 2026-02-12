import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import logoFabrik from "@/assets/logo-fabrik.png";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({ title: "Erro", description: "As senhas não coincidem.", variant: "destructive" });
      return;
    }

    if (password.length < 6) {
      toast({ title: "Erro", description: "A senha deve ter pelo menos 6 caracteres.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Senha redefinida!", description: "Sua senha foi atualizada com sucesso." });
      navigate("/login");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex justify-center mb-10">
          <img src={logoFabrik} alt="Fabrik" className="h-16 w-auto" />
        </div>

        <div className="space-y-1 mb-8">
          <h1 className="font-display text-2xl font-bold tracking-tight">Redefinir senha</h1>
          <p className="text-sm text-muted-foreground">Escolha uma nova senha para sua conta.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Nova senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="h-11 pr-10"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Confirmar senha</Label>
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="h-11"
            />
          </div>

          <Button type="submit" className="w-full h-11 font-semibold" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Redefinir senha
          </Button>

          <button type="button" onClick={() => navigate("/login")} className="block w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors">
            Voltar ao login
          </button>
        </form>
      </div>
    </div>
  );
}
