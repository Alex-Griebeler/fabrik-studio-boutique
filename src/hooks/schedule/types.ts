export type SessionStatus = "scheduled" | "cancelled" | "completed";
export type BookingStatus = "confirmed" | "cancelled" | "waitlist" | "no_show";

export interface ClassModality {
  id: string;
  name: string;
  slug: string;
  color: string;
  is_active: boolean;
  sort_order: number;
}

export interface ClassTemplate {
  id: string;
  modality: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  instructor_id: string | null;
  location: string | null;
  is_active: boolean;
  recurrence_start: string;
  recurrence_end: string | null;
  created_at: string;
  instructor?: { id: string; full_name: string } | null;
}

export interface ClassSession {
  id: string;
  template_id: string | null;
  session_date: string;
  start_time: string;
  duration_minutes: number;
  modality: string;
  capacity: number;
  instructor_id: string | null;
  status: SessionStatus;
  notes: string | null;
  is_exception: boolean;
  created_at: string;
  instructor?: { id: string; full_name: string } | null;
  bookings?: ClassBooking[];
}

export interface ClassBooking {
  id: string;
  session_id: string;
  student_id: string;
  status: BookingStatus;
  booked_at: string;
  cancelled_at: string | null;
  student?: { id: string; full_name: string } | null;
}

const COLOR_MAP: Record<string, string> = {
  primary: "bg-primary/15 text-primary border-primary/30",
  destructive: "bg-destructive/15 text-destructive border-destructive/30",
  info: "bg-info/15 text-info border-info/30",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  secondary: "bg-secondary/15 text-secondary border-secondary/30",
  accent: "bg-accent/30 text-accent-foreground border-accent/50",
  purple: "bg-purple-500/15 text-purple-600 border-purple-500/30",
  pink: "bg-pink-500/15 text-pink-600 border-pink-500/30",
  orange: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  teal: "bg-teal-500/15 text-teal-600 border-teal-500/30",
  indigo: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30",
  cyan: "bg-cyan-500/15 text-cyan-600 border-cyan-500/30",
};

export function getModalityColor(color: string): string {
  return COLOR_MAP[color] || COLOR_MAP.primary;
}
