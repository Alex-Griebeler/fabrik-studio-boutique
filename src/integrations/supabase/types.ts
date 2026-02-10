export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bank_imports: {
        Row: {
          account_id: string | null
          bank_id: string | null
          created_at: string
          error_message: string | null
          file_name: string
          file_type: string
          file_url: string | null
          id: string
          imported_by: string | null
          period_end: string | null
          period_start: string | null
          status: string
          total_credits_cents: number | null
          total_debits_cents: number | null
          total_transactions: number | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          bank_id?: string | null
          created_at?: string
          error_message?: string | null
          file_name: string
          file_type: string
          file_url?: string | null
          id?: string
          imported_by?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          total_credits_cents?: number | null
          total_debits_cents?: number | null
          total_transactions?: number | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          bank_id?: string | null
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_type?: string
          file_url?: string | null
          id?: string
          imported_by?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          total_credits_cents?: number | null
          total_debits_cents?: number | null
          total_transactions?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          amount_cents: number
          created_at: string
          fit_id: string
          id: string
          import_id: string
          is_balance_entry: boolean | null
          match_confidence: string | null
          match_status: string
          matched_at: string | null
          matched_by: string | null
          matched_expense_id: string | null
          matched_invoice_id: string | null
          memo: string
          parsed_document: string | null
          parsed_name: string | null
          parsed_type: string | null
          posted_date: string
          transaction_type: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          fit_id: string
          id?: string
          import_id: string
          is_balance_entry?: boolean | null
          match_confidence?: string | null
          match_status?: string
          matched_at?: string | null
          matched_by?: string | null
          matched_expense_id?: string | null
          matched_invoice_id?: string | null
          memo: string
          parsed_document?: string | null
          parsed_name?: string | null
          parsed_type?: string | null
          posted_date: string
          transaction_type: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          fit_id?: string
          id?: string
          import_id?: string
          is_balance_entry?: boolean | null
          match_confidence?: string | null
          match_status?: string
          matched_at?: string | null
          matched_by?: string | null
          matched_expense_id?: string | null
          matched_invoice_id?: string | null
          memo?: string
          parsed_document?: string | null
          parsed_name?: string | null
          parsed_type?: string | null
          posted_date?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "bank_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_expense_id_fkey"
            columns: ["matched_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_invoice_id_fkey"
            columns: ["matched_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      class_bookings: {
        Row: {
          booked_at: string
          cancelled_at: string | null
          id: string
          session_id: string
          status: Database["public"]["Enums"]["booking_status"]
          student_id: string
        }
        Insert: {
          booked_at?: string
          cancelled_at?: string | null
          id?: string
          session_id: string
          status?: Database["public"]["Enums"]["booking_status"]
          student_id: string
        }
        Update: {
          booked_at?: string
          cancelled_at?: string | null
          id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["booking_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_bookings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      class_modalities: {
        Row: {
          color: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      class_sessions: {
        Row: {
          capacity: number
          created_at: string
          duration_minutes: number
          id: string
          instructor_id: string | null
          is_exception: boolean
          modality: string
          notes: string | null
          session_date: string
          start_time: string
          status: Database["public"]["Enums"]["session_status"]
          template_id: string | null
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          duration_minutes?: number
          id?: string
          instructor_id?: string | null
          is_exception?: boolean
          modality: string
          notes?: string | null
          session_date: string
          start_time: string
          status?: Database["public"]["Enums"]["session_status"]
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          duration_minutes?: number
          id?: string
          instructor_id?: string | null
          is_exception?: boolean
          modality?: string
          notes?: string | null
          session_date?: string
          start_time?: string
          status?: Database["public"]["Enums"]["session_status"]
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_sessions_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "class_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      class_templates: {
        Row: {
          capacity: number
          created_at: string
          day_of_week: number
          duration_minutes: number
          id: string
          instructor_id: string | null
          is_active: boolean
          location: string | null
          modality: string
          recurrence_end: string | null
          recurrence_start: string
          start_time: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          day_of_week: number
          duration_minutes?: number
          id?: string
          instructor_id?: string | null
          is_active?: boolean
          location?: string | null
          modality: string
          recurrence_end?: string | null
          recurrence_start?: string
          start_time: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          day_of_week?: number
          duration_minutes?: number
          id?: string
          instructor_id?: string | null
          is_active?: boolean
          location?: string | null
          modality?: string
          recurrence_end?: string | null
          recurrence_start?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_templates_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          discount_cents: number | null
          end_date: string | null
          id: string
          monthly_value_cents: number | null
          notes: string | null
          payment_day: number | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          plan_id: string
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          student_id: string
          total_value_cents: number | null
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          discount_cents?: number | null
          end_date?: string | null
          id?: string
          monthly_value_cents?: number | null
          notes?: string | null
          payment_day?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          plan_id: string
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"]
          student_id: string
          total_value_cents?: number | null
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          discount_cents?: number | null
          end_date?: string | null
          id?: string
          monthly_value_cents?: number | null
          notes?: string | null
          payment_day?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          plan_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          student_id?: string
          total_value_cents?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_cents: number
          category_id: string
          created_at: string
          description: string
          due_date: string
          id: string
          notes: string | null
          payment_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          recurrence: string | null
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          category_id: string
          created_at?: string
          description: string
          due_date: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          recurrence?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          category_id?: string
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          recurrence?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          scheduled_at: string | null
          student_id: string
          type: Database["public"]["Enums"]["interaction_type"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          scheduled_at?: string | null
          student_id: string
          type: Database["public"]["Enums"]["interaction_type"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          scheduled_at?: string | null
          student_id?: string
          type?: Database["public"]["Enums"]["interaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          contract_id: string
          created_at: string
          due_date: string
          id: string
          notes: string | null
          paid_amount_cents: number | null
          payment_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_proof_url: string | null
          reference_month: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          student_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          contract_id: string
          created_at?: string
          due_date: string
          id?: string
          notes?: string | null
          paid_amount_cents?: number | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_proof_url?: string | null
          reference_month?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          contract_id?: string
          created_at?: string
          due_date?: string
          id?: string
          notes?: string | null
          paid_amount_cents?: number | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_proof_url?: string | null
          reference_month?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          category: Database["public"]["Enums"]["plan_category"]
          created_at: string
          description: string | null
          duration: Database["public"]["Enums"]["plan_duration"]
          frequency: string | null
          id: string
          is_active: boolean
          name: string
          price_cents: number
          updated_at: string
          validity_days: number | null
        }
        Insert: {
          category: Database["public"]["Enums"]["plan_category"]
          created_at?: string
          description?: string | null
          duration: Database["public"]["Enums"]["plan_duration"]
          frequency?: string | null
          id?: string
          is_active?: boolean
          name: string
          price_cents: number
          updated_at?: string
          validity_days?: number | null
        }
        Update: {
          category?: Database["public"]["Enums"]["plan_category"]
          created_at?: string
          description?: string | null
          duration?: Database["public"]["Enums"]["plan_duration"]
          frequency?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          updated_at?: string
          validity_days?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          address: Json | null
          cpf: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          gender: string | null
          id: string
          is_active: boolean
          lead_source: string | null
          lead_stage: string | null
          medical_conditions: string | null
          notes: string | null
          phone: string | null
          profile_id: string | null
          profile_photo_url: string | null
          referred_by: string | null
          status: Database["public"]["Enums"]["student_status"]
          updated_at: string
        }
        Insert: {
          address?: Json | null
          cpf?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name: string
          gender?: string | null
          id?: string
          is_active?: boolean
          lead_source?: string | null
          lead_stage?: string | null
          medical_conditions?: string | null
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          profile_photo_url?: string | null
          referred_by?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
        }
        Update: {
          address?: Json | null
          cpf?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          is_active?: boolean
          lead_source?: string | null
          lead_stage?: string | null
          medical_conditions?: string | null
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          profile_photo_url?: string | null
          referred_by?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_own_contract: { Args: { _contract_id: string }; Returns: boolean }
      is_own_invoice: { Args: { _invoice_id: string }; Returns: boolean }
      is_own_profile: { Args: { _profile_id: string }; Returns: boolean }
      is_own_student: { Args: { _student_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "instructor" | "student" | "manager" | "reception"
      booking_status: "confirmed" | "cancelled" | "waitlist" | "no_show"
      contract_status: "active" | "suspended" | "cancelled" | "expired"
      expense_status: "pending" | "paid" | "cancelled"
      interaction_type:
        | "phone_call"
        | "whatsapp"
        | "email"
        | "visit"
        | "trial_class"
        | "follow_up"
        | "note"
      invoice_status: "pending" | "paid" | "overdue" | "cancelled"
      payment_method:
        | "pix"
        | "credit_card"
        | "debit_card"
        | "boleto"
        | "cash"
        | "transfer"
      plan_category:
        | "grupos_adultos"
        | "renovacao_grupos_adultos"
        | "plano_30_dias"
        | "sessoes_avulsas_adultos"
        | "planos_70_plus"
        | "planos_adolescentes"
        | "sessoes_avulsas_adolescentes"
        | "personal"
        | "renovacao_personal"
        | "alex_griebeler_individual"
        | "alex_griebeler_small_group"
      plan_duration:
        | "anual"
        | "semestral"
        | "trimestral"
        | "mensal"
        | "avulso"
        | "unico"
      session_status: "scheduled" | "cancelled" | "completed"
      student_status: "lead" | "active" | "inactive" | "suspended"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "instructor", "student", "manager", "reception"],
      booking_status: ["confirmed", "cancelled", "waitlist", "no_show"],
      contract_status: ["active", "suspended", "cancelled", "expired"],
      expense_status: ["pending", "paid", "cancelled"],
      interaction_type: [
        "phone_call",
        "whatsapp",
        "email",
        "visit",
        "trial_class",
        "follow_up",
        "note",
      ],
      invoice_status: ["pending", "paid", "overdue", "cancelled"],
      payment_method: [
        "pix",
        "credit_card",
        "debit_card",
        "boleto",
        "cash",
        "transfer",
      ],
      plan_category: [
        "grupos_adultos",
        "renovacao_grupos_adultos",
        "plano_30_dias",
        "sessoes_avulsas_adultos",
        "planos_70_plus",
        "planos_adolescentes",
        "sessoes_avulsas_adolescentes",
        "personal",
        "renovacao_personal",
        "alex_griebeler_individual",
        "alex_griebeler_small_group",
      ],
      plan_duration: [
        "anual",
        "semestral",
        "trimestral",
        "mensal",
        "avulso",
        "unico",
      ],
      session_status: ["scheduled", "cancelled", "completed"],
      student_status: ["lead", "active", "inactive", "suspended"],
    },
  },
} as const
