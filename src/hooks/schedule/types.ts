// ==========================================
// Schedule module types
// ==========================================

// --- Enums ---
export type FullSessionStatus =
  | "scheduled"
  | "cancelled_on_time"
  | "cancelled_late"
  | "no_show"
  | "completed"
  | "disputed"
  | "adjusted"
  | "late_arrival";

export type SessionType = "personal" | "group";
export type CheckinMethod = "manual" | "qr_code" | "geolocation" | "auto";
export type TrainerPaymentMethod = "hourly" | "per_session" | "hybrid";
export type MakeupCreditStatus = "available" | "used" | "expired";

// Legacy (still used by class_bookings / class_templates)
export type BookingStatus = "confirmed" | "cancelled" | "waitlist" | "no_show";

// --- Modalities (unchanged) ---
export interface ClassModality {
  id: string;
  name: string;
  slug: string;
  color: string;
  is_active: boolean;
  sort_order: number;
}

// --- Templates (unchanged) ---
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

// --- NEW Session (single source of truth) ---
export interface Session {
  id: string;
  session_type: SessionType;
  modality: string;
  student_id: string | null;
  contract_id: string | null;
  template_id: string | null;

  // Trainers
  trainer_id: string | null;
  assistant_trainer_id: string | null;

  // Scheduling
  session_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  capacity: number;

  // Financial snapshot
  trainer_hourly_rate_cents: number;
  assistant_hourly_rate_cents: number;
  payment_hours: number;
  payment_amount_cents: number;
  assistant_payment_amount_cents: number;
  is_paid: boolean;
  paid_at: string | null;

  // Status
  status: FullSessionStatus;

  // Check-in: trainer
  trainer_checkin_at: string | null;
  trainer_checkin_method: CheckinMethod | null;

  // Check-in: student
  student_checkin_at: string | null;
  student_checkin_method: CheckinMethod | null;

  // Cancellation
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  cancellation_within_cutoff: boolean | null;

  // Late arrival
  actual_start_time: string | null;
  late_minutes: number;

  // Metadata
  notes: string | null;
  is_exception: boolean;
  is_makeup: boolean;
  makeup_credit_id: string | null;

  created_at: string;
  updated_at: string;

  // Joined data (from queries)
  trainer?: { id: string; full_name: string } | null;
  assistant_trainer?: { id: string; full_name: string } | null;
  student?: { id: string; full_name: string } | null;
  bookings?: ClassBooking[];
}

// --- Bookings (for group sessions, still uses class_bookings) ---
export interface ClassBooking {
  id: string;
  session_id: string;
  student_id: string;
  status: BookingStatus;
  booked_at: string;
  cancelled_at: string | null;
  student?: { id: string; full_name: string } | null;
}

// --- Trainers ---
export interface Trainer {
  id: string;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  specialties: string[];
  certifications: string[];
  bio: string | null;
  payment_method: TrainerPaymentMethod;
  hourly_rate_main_cents: number;
  hourly_rate_assistant_cents: number;
  session_rate_cents: number;
  bank_name: string | null;
  bank_agency: string | null;
  bank_account: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  is_active: boolean;
  hired_at: string | null;
  terminated_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// --- Policies ---
export interface Policy {
  id: string;
  key: string;
  value: any; // jsonb
  description: string | null;
}

// --- Makeup Credits ---
export interface MakeupCredit {
  id: string;
  student_id: string;
  contract_id: string | null;
  original_session_id: string | null;
  used_session_id: string | null;
  status: MakeupCreditStatus;
  expires_at: string | null;
  used_at: string | null;
  notes: string | null;
  created_at: string;
  student?: { id: string; full_name: string } | null;
}

// --- Color map for modalities ---
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

// --- Status labels & colors ---
export const SESSION_STATUS_MAP: Record<FullSessionStatus, { label: string; color: string }> = {
  scheduled: { label: "Agendada", color: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  completed: { label: "Concluída", color: "bg-success/15 text-success border-success/30" },
  cancelled_on_time: { label: "Cancelada (prazo)", color: "bg-muted text-muted-foreground border-muted" },
  cancelled_late: { label: "Cancelada (tardia)", color: "bg-warning/15 text-warning border-warning/30" },
  no_show: { label: "Falta", color: "bg-destructive/15 text-destructive border-destructive/30" },
  late_arrival: { label: "Atraso", color: "bg-orange-500/15 text-orange-600 border-orange-500/30" },
  disputed: { label: "Contestada", color: "bg-purple-500/15 text-purple-600 border-purple-500/30" },
  adjusted: { label: "Ajustada", color: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30" },
};

// Backward compat alias
export type ClassSession = Session;
