import { LogIn, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface CheckInButtonProps {
  type: "trainer" | "student";
  checkinAt: string | null;
  onCheckin: () => void;
  isPending?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

const LABELS = {
  trainer: { action: "Check-in Treinador", done: "Treinador presente" },
  student: { action: "Check-in Aluno", done: "Aluno presente" },
};

export function CheckInButton({
  type,
  checkinAt,
  onCheckin,
  isPending,
  disabled,
  compact,
}: CheckInButtonProps) {
  const labels = LABELS[type];
  const colorClass = type === "trainer" ? "text-success" : "text-info";

  if (checkinAt) {
    const time = format(new Date(checkinAt), "HH:mm");
    if (compact) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <CheckCircle2 className={cn("h-3.5 w-3.5", colorClass)} />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {labels.done} às {time}
          </TooltipContent>
        </Tooltip>
      );
    }
    return (
      <div className={cn("flex items-center gap-1.5 text-xs", colorClass)}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>{labels.done} às {time}</span>
      </div>
    );
  }

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onCheckin}
            disabled={isPending || disabled}
          >
            <LogIn className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {labels.action}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs flex-1"
      onClick={onCheckin}
      disabled={isPending || disabled}
    >
      <LogIn className="h-3 w-3 mr-1" />
      {labels.action}
    </Button>
  );
}
