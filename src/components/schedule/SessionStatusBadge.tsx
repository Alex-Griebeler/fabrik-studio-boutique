import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { FullSessionStatus, SESSION_STATUS_MAP } from "@/hooks/useSchedule";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Ban,
  ShieldAlert,
  Settings2,
  CircleDot,
} from "lucide-react";

const STATUS_ICONS: Record<FullSessionStatus, React.ElementType> = {
  scheduled: CircleDot,
  completed: CheckCircle2,
  cancelled_on_time: Ban,
  cancelled_late: XCircle,
  no_show: AlertTriangle,
  late_arrival: Clock,
  disputed: ShieldAlert,
  adjusted: Settings2,
};

interface SessionStatusBadgeProps {
  status: FullSessionStatus;
  size?: "sm" | "md";
  showIcon?: boolean;
  className?: string;
}

export function SessionStatusBadge({
  status,
  size = "sm",
  showIcon = true,
  className,
}: SessionStatusBadgeProps) {
  const info = SESSION_STATUS_MAP[status];
  const Icon = STATUS_ICONS[status];

  return (
    <Badge
      variant="outline"
      className={cn(
        info.color,
        size === "sm" ? "text-[9px] px-1.5 py-0 gap-0.5" : "text-xs px-2 py-0.5 gap-1",
        className
      )}
    >
      {showIcon && <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />}
      {info.label}
    </Badge>
  );
}
