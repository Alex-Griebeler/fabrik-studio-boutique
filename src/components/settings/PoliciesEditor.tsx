import { useState, useEffect } from "react";
import { usePolicies, useUpdatePolicy } from "@/hooks/usePolicies";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, ShieldCheck, Users, CalendarCheck, Save } from "lucide-react";

interface PolicyField {
  key: string;
  label: string;
  type: "number" | "boolean";
  suffix?: string;
}

interface PolicyGroup {
  title: string;
  description: string;
  icon: React.ReactNode;
  fields: PolicyField[];
}

const POLICY_GROUPS: PolicyGroup[] = [
  {
    title: "Cancelamento",
    description: "Prazos mínimos para cancelamento sem cobrança",
    icon: <Clock className="h-5 w-5 text-primary" />,
    fields: [
      { key: "personal_cancellation_cutoff_hours", label: "Cutoff Personal", type: "number", suffix: "horas" },
      { key: "group_cancellation_cutoff_hours", label: "Cutoff Grupo", type: "number", suffix: "horas" },
    ],
  },
  {
    title: "Tolerâncias",
    description: "Tolerância de atraso e auto-complete",
    icon: <ShieldCheck className="h-5 w-5 text-primary" />,
    fields: [
      { key: "late_arrival_tolerance_minutes", label: "Tolerância de atraso", type: "number", suffix: "min" },
      { key: "auto_complete_after_minutes", label: "Auto-completar após término", type: "number", suffix: "min" },
    ],
  },
  {
    title: "Sessões",
    description: "Padrões para criação de sessões",
    icon: <CalendarCheck className="h-5 w-5 text-primary" />,
    fields: [
      { key: "default_session_duration_minutes", label: "Duração padrão", type: "number", suffix: "min" },
      { key: "default_group_capacity", label: "Capacidade de grupo", type: "number", suffix: "alunos" },
      { key: "makeup_credit_validity_days", label: "Validade do crédito de reposição", type: "number", suffix: "dias" },
    ],
  },
  {
    title: "Check-in",
    description: "Obrigatoriedade de check-in para completar sessão",
    icon: <Users className="h-5 w-5 text-primary" />,
    fields: [
      { key: "trainer_checkin_required", label: "Check-in do treinador obrigatório", type: "boolean" },
      { key: "student_checkin_required", label: "Check-in do aluno obrigatório", type: "boolean" },
    ],
  },
];

export function PoliciesEditor() {
  const { data: policies, isLoading } = usePolicies();
  const updatePolicy = useUpdatePolicy();
  const [localValues, setLocalValues] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!policies) return;
    const map: Record<string, any> = {};
    for (const p of policies) {
      try {
        map[p.key] = typeof p.value === "string" ? JSON.parse(p.value as string) : p.value;
      } catch {
        map[p.key] = p.value;
      }
    }
    setLocalValues(map);
    setDirty(new Set());
  }, [policies]);

  const setValue = (key: string, val: any) => {
    setLocalValues((prev) => ({ ...prev, [key]: val }));
    setDirty((prev) => new Set(prev).add(key));
  };

  const saveAll = () => {
    dirty.forEach((key) => {
      updatePolicy.mutate({ key, value: localValues[key] });
    });
    setDirty(new Set());
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {POLICY_GROUPS.map((group) => (
          <Card key={group.title}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {group.icon}
                {group.title}
              </CardTitle>
              <CardDescription className="text-xs">{group.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {group.fields.map((field) => {
                const val = localValues[field.key];
                if (field.type === "boolean") {
                  return (
                    <div key={field.key} className="flex items-center justify-between gap-2">
                      <Label htmlFor={field.key} className="text-sm font-normal">
                        {field.label}
                      </Label>
                      <Switch
                        id={field.key}
                        checked={!!val}
                        onCheckedChange={(checked) => setValue(field.key, checked)}
                      />
                    </div>
                  );
                }
                return (
                  <div key={field.key} className="space-y-1">
                    <Label htmlFor={field.key} className="text-xs text-muted-foreground">
                      {field.label}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={field.key}
                        type="number"
                        min={0}
                        value={val ?? ""}
                        onChange={(e) => setValue(field.key, Number(e.target.value))}
                        className="w-24"
                      />
                      {field.suffix && (
                        <span className="text-xs text-muted-foreground">{field.suffix}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      {dirty.size > 0 && (
        <div className="flex justify-end">
          <Button onClick={saveAll} disabled={updatePolicy.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Salvar alterações ({dirty.size})
          </Button>
        </div>
      )}
    </div>
  );
}
