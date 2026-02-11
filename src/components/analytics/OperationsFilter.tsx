import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useClassSessions } from "@/hooks/schedule";
import { useTrainers } from "@/hooks/useTrainers";
import { startOfMonth, endOfMonth, format } from "date-fns";

export interface OperationsFilters {
  modality?: string;
  instructor?: string;
  dateRange?: "today" | "week" | "month";
}

interface OperationsFilterProps {
  filters: OperationsFilters;
  onFiltersChange: (filters: OperationsFilters) => void;
}

export function OperationsFilter({ filters, onFiltersChange }: OperationsFilterProps) {
  const today = new Date();
  const startDate = format(startOfMonth(today), "yyyy-MM-dd");
  const endDate = format(endOfMonth(today), "yyyy-MM-dd");
  
  const { data: sessions } = useClassSessions(startDate, endDate);
  const { data: trainers } = useTrainers();

  const uniqueModalities = useMemo(() => {
    const mods = new Set<string>();
    sessions?.forEach((s: any) => {
      if (s.modality) mods.add(s.modality);
    });
    return Array.from(mods).sort();
  }, [sessions]);

  return (
    <div className="flex flex-col gap-4 p-4 rounded-lg border bg-card">
      <div>
        <Label htmlFor="modality" className="text-sm font-medium mb-2 block">
          Modalidade
        </Label>
        <Select
          value={filters.modality || ""}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, modality: value === "all" ? undefined : value })
          }
        >
          <SelectTrigger id="modality">
            <SelectValue placeholder="Todas as modalidades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as modalidades</SelectItem>
            {uniqueModalities.map((mod) => (
              <SelectItem key={mod} value={mod}>
                {mod}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="instructor" className="text-sm font-medium mb-2 block">
          Instrutor
        </Label>
        <Select
          value={filters.instructor || ""}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, instructor: value === "all" ? undefined : value })
          }
        >
          <SelectTrigger id="instructor">
            <SelectValue placeholder="Todos os instrutores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os instrutores</SelectItem>
            {trainers?.map((trainer: any) => (
              <SelectItem key={trainer.id} value={trainer.id}>
                {trainer.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="dateRange" className="text-sm font-medium mb-2 block">
          Período
        </Label>
        <Select
          value={filters.dateRange || "month"}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, dateRange: value as "today" | "week" | "month" })
          }
        >
          <SelectTrigger id="dateRange">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="week">Esta Semana</SelectItem>
            <SelectItem value="month">Este Mês</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
