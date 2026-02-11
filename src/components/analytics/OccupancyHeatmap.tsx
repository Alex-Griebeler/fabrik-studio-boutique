import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

function getColor(value: number, max: number) {
  if (max === 0 || value === 0) return "hsl(var(--muted))";
  const ratio = value / max;
  if (ratio < 0.25) return "hsl(var(--primary) / 0.15)";
  if (ratio < 0.5) return "hsl(var(--primary) / 0.35)";
  if (ratio < 0.75) return "hsl(var(--primary) / 0.6)";
  return "hsl(var(--primary) / 0.9)";
}

interface Props {
  heatmap: { day: number; hour: number; count: number }[];
}

export function OccupancyHeatmap({ heatmap }: Props) {
  const map = new Map<string, number>();
  let max = 0;
  for (const h of heatmap) {
    const key = `${h.day}-${h.hour}`;
    map.set(key, h.count);
    if (h.count > max) max = h.count;
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Mapa de Calor — Ocupação por Horário</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <TooltipProvider>
            <div className="inline-grid gap-1" style={{ gridTemplateColumns: `60px repeat(${HOURS.length}, 1fr)` }}>
              {/* Header row */}
              <div />
              {HOURS.map((h) => (
                <div key={h} className="text-[10px] text-muted-foreground text-center font-medium">
                  {String(h).padStart(2, "0")}h
                </div>
              ))}

              {/* Data rows */}
              {DAY_LABELS.map((label, dayIdx) => (
                <>
                  <div key={`label-${dayIdx}`} className="text-xs text-muted-foreground flex items-center font-medium">
                    {label}
                  </div>
                  {HOURS.map((hour) => {
                    const count = map.get(`${dayIdx}-${hour}`) ?? 0;
                    return (
                      <Tooltip key={`${dayIdx}-${hour}`}>
                        <TooltipTrigger asChild>
                          <div
                            className="w-7 h-7 rounded-sm cursor-default transition-colors"
                            style={{ backgroundColor: getColor(count, max), minWidth: 28 }}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {label} {String(hour).padStart(2, "0")}:00 — {count} sessões
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </>
              ))}
            </div>
          </TooltipProvider>

          {/* Legend */}
          <div className="flex items-center gap-2 mt-4 text-[10px] text-muted-foreground">
            <span>Menos</span>
            {[0.15, 0.35, 0.6, 0.9].map((opacity) => (
              <div
                key={opacity}
                className="w-4 h-4 rounded-sm"
                style={{ backgroundColor: `hsl(var(--primary) / ${opacity})` }}
              />
            ))}
            <span>Mais</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
