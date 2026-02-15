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
      ai_agent_config: {
        Row: {
          behavior_config: Json
          created_at: string
          description: string | null
          handoff_rules: Json
          id: string
          is_active: boolean | null
          knowledge_base: Json
          max_tokens: number | null
          model: string | null
          name: string
          system_prompt: string | null
          temperature: number | null
          updated_at: string
        }
        Insert: {
          behavior_config?: Json
          created_at?: string
          description?: string | null
          handoff_rules?: Json
          id?: string
          is_active?: boolean | null
          knowledge_base?: Json
          max_tokens?: number | null
          model?: string | null
          name: string
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string
        }
        Update: {
          behavior_config?: Json
          created_at?: string
          description?: string | null
          handoff_rules?: Json
          id?: string
          is_active?: boolean | null
          knowledge_base?: Json
          max_tokens?: number | null
          model?: string | null
          name?: string
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_conversation_logs: {
        Row: {
          conversation_id: string
          cost_cents: number
          created_at: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
        }
        Insert: {
          conversation_id: string
          cost_cents?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
        }
        Update: {
          conversation_id?: string
          cost_cents?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
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
      commissions: {
        Row: {
          competencia: string
          contract_id: string | null
          created_at: string
          data_pagamento: string | null
          id: string
          lead_id: string | null
          percentual_comissao: number
          profile_id: string
          status: Database["public"]["Enums"]["commission_status"]
          tipo: Database["public"]["Enums"]["commission_type"]
          updated_at: string
          valor_base_cents: number
          valor_comissao_cents: number
        }
        Insert: {
          competencia: string
          contract_id?: string | null
          created_at?: string
          data_pagamento?: string | null
          id?: string
          lead_id?: string | null
          percentual_comissao?: number
          profile_id: string
          status?: Database["public"]["Enums"]["commission_status"]
          tipo: Database["public"]["Enums"]["commission_type"]
          updated_at?: string
          valor_base_cents?: number
          valor_comissao_cents?: number
        }
        Update: {
          competencia?: string
          contract_id?: string | null
          created_at?: string
          data_pagamento?: string | null
          id?: string
          lead_id?: string | null
          percentual_comissao?: number
          profile_id?: string
          status?: Database["public"]["Enums"]["commission_status"]
          tipo?: Database["public"]["Enums"]["commission_type"]
          updated_at?: string
          valor_base_cents?: number
          valor_comissao_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "commissions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_profile_id_fkey"
            columns: ["profile_id"]
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
      conversation_messages: {
        Row: {
          ai_generated: boolean | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json
          role: string
        }
        Insert: {
          ai_generated?: boolean | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json
          role: string
        }
        Update: {
          ai_generated?: boolean | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agent_id: string | null
          channel: string
          context: Json
          created_at: string
          id: string
          last_message_at: string | null
          lead_id: string
          status: string
          taken_over_at: string | null
          taken_over_by: string | null
          topic: string | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          channel?: string
          context?: Json
          created_at?: string
          id?: string
          last_message_at?: string | null
          lead_id: string
          status?: string
          taken_over_at?: string | null
          taken_over_by?: string | null
          topic?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          channel?: string
          context?: Json
          created_at?: string
          id?: string
          last_message_at?: string | null
          lead_id?: string
          status?: string
          taken_over_at?: string | null
          taken_over_by?: string | null
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
      expense_category_rules: {
        Row: {
          category_id: string
          created_at: string
          id: string
          is_active: boolean
          keyword: string
          priority: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          keyword: string
          priority?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          keyword?: string
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_category_rules_category_id_fkey"
            columns: ["category_id"]
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
          lead_id: string | null
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
          lead_id?: string | null
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
          lead_id?: string | null
          scheduled_at?: string | null
          student_id?: string
          type?: Database["public"]["Enums"]["interaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
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
      leads: {
        Row: {
          consultant_id: string | null
          converted_to_student_id: string | null
          created_at: string
          email: string | null
          id: string
          lost_reason: string | null
          name: string
          notes: string | null
          phone: string | null
          qualification_details: Json
          qualification_score: number
          referred_by: string | null
          source: string | null
          status: string
          tags: string[]
          temperature: string | null
          trial_date: string | null
          trial_time: string | null
          trial_type: string | null
          updated_at: string
          utm_params: Json | null
        }
        Insert: {
          consultant_id?: string | null
          converted_to_student_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lost_reason?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          qualification_details?: Json
          qualification_score?: number
          referred_by?: string | null
          source?: string | null
          status?: string
          tags?: string[]
          temperature?: string | null
          trial_date?: string | null
          trial_time?: string | null
          trial_type?: string | null
          updated_at?: string
          utm_params?: Json | null
        }
        Update: {
          consultant_id?: string | null
          converted_to_student_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lost_reason?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          qualification_details?: Json
          qualification_score?: number
          referred_by?: string | null
          source?: string | null
          status?: string
          tags?: string[]
          temperature?: string | null
          trial_date?: string | null
          trial_time?: string | null
          trial_type?: string | null
          updated_at?: string
          utm_params?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_to_student_id_fkey"
            columns: ["converted_to_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      makeup_credits: {
        Row: {
          contract_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          notes: string | null
          original_session_id: string | null
          status: Database["public"]["Enums"]["makeup_credit_status"]
          student_id: string
          updated_at: string
          used_at: string | null
          used_session_id: string | null
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          original_session_id?: string | null
          status?: Database["public"]["Enums"]["makeup_credit_status"]
          student_id: string
          updated_at?: string
          used_at?: string | null
          used_session_id?: string | null
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          original_session_id?: string | null
          status?: Database["public"]["Enums"]["makeup_credit_status"]
          student_id?: string
          updated_at?: string
          used_at?: string | null
          used_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "makeup_credits_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makeup_credits_original_session_id_fkey"
            columns: ["original_session_id"]
            isOneToOne: false
            referencedRelation: "payable_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makeup_credits_original_session_id_fkey"
            columns: ["original_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makeup_credits_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makeup_credits_used_session_id_fkey"
            columns: ["used_session_id"]
            isOneToOne: false
            referencedRelation: "payable_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makeup_credits_used_session_id_fkey"
            columns: ["used_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          category: string
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
          variables: string[] | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          variables?: string[] | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          variables?: string[] | null
        }
        Relationships: []
      }
      monthly_kpis: {
        Row: {
          alunos_novos: number
          alunos_perdidos: number
          calculado_em: string
          cancelamentos: number
          competencia: string
          conversoes_indicacao: number
          conversoes_marketing: number
          despesas_cents: number
          faturamento_cents: number
          leads_indicacao: number
          leads_marketing: number
          leads_resgate: number
          margem_lucro_pct: number
          planos_para_renovar: number
          renovacoes_efetivas: number
          resultado_cents: number
          taxa_churn: number
          taxa_conversao_experimentais: number
          taxa_conversao_leads: number
          taxa_renovacao: number
          total_alunos: number
          total_conversoes: number
          total_experimentais: number
          total_leads: number
        }
        Insert: {
          alunos_novos?: number
          alunos_perdidos?: number
          calculado_em?: string
          cancelamentos?: number
          competencia: string
          conversoes_indicacao?: number
          conversoes_marketing?: number
          despesas_cents?: number
          faturamento_cents?: number
          leads_indicacao?: number
          leads_marketing?: number
          leads_resgate?: number
          margem_lucro_pct?: number
          planos_para_renovar?: number
          renovacoes_efetivas?: number
          resultado_cents?: number
          taxa_churn?: number
          taxa_conversao_experimentais?: number
          taxa_conversao_leads?: number
          taxa_renovacao?: number
          total_alunos?: number
          total_conversoes?: number
          total_experimentais?: number
          total_leads?: number
        }
        Update: {
          alunos_novos?: number
          alunos_perdidos?: number
          calculado_em?: string
          cancelamentos?: number
          competencia?: string
          conversoes_indicacao?: number
          conversoes_marketing?: number
          despesas_cents?: number
          faturamento_cents?: number
          leads_indicacao?: number
          leads_marketing?: number
          leads_resgate?: number
          margem_lucro_pct?: number
          planos_para_renovar?: number
          renovacoes_efetivas?: number
          resultado_cents?: number
          taxa_churn?: number
          taxa_conversao_experimentais?: number
          taxa_conversao_leads?: number
          taxa_renovacao?: number
          total_alunos?: number
          total_conversoes?: number
          total_experimentais?: number
          total_leads?: number
        }
        Relationships: []
      }
      nfse: {
        Row: {
          amount_cents: number
          api_response: Json | null
          authorization_date: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          email_sent: boolean | null
          email_sent_at: string | null
          email_sent_to: string[] | null
          error_message: string | null
          external_id: string | null
          id: string
          invoice_id: string
          nfse_number: string | null
          pdf_url: string | null
          service_description: string
          status: string
          student_id: string | null
          tomador_cpf: string | null
          tomador_email: string | null
          tomador_endereco: Json | null
          tomador_nome: string
          updated_at: string
          verification_code: string | null
          xml_url: string | null
        }
        Insert: {
          amount_cents: number
          api_response?: Json | null
          authorization_date?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          email_sent_to?: string[] | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          invoice_id: string
          nfse_number?: string | null
          pdf_url?: string | null
          service_description?: string
          status?: string
          student_id?: string | null
          tomador_cpf?: string | null
          tomador_email?: string | null
          tomador_endereco?: Json | null
          tomador_nome: string
          updated_at?: string
          verification_code?: string | null
          xml_url?: string | null
        }
        Update: {
          amount_cents?: number
          api_response?: Json | null
          authorization_date?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          email_sent_to?: string[] | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          invoice_id?: string
          nfse_number?: string | null
          pdf_url?: string | null
          service_description?: string
          status?: string
          student_id?: string | null
          tomador_cpf?: string | null
          tomador_email?: string | null
          tomador_endereco?: Json | null
          tomador_nome?: string
          updated_at?: string
          verification_code?: string | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfse_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      nurturing_sequences: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          trigger_status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          trigger_status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          trigger_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payroll_cycles: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          competencia: string
          created_at: string
          created_by: string
          end_date: string
          id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          competencia: string
          created_at?: string
          created_by: string
          end_date: string
          id?: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          competencia?: string
          created_at?: string
          created_by?: string
          end_date?: string
          id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payroll_disputes: {
        Row: {
          created_at: string
          dispute_detail: string | null
          dispute_reason: string
          id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          session_id: string
          status: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dispute_detail?: string | null
          dispute_reason: string
          id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id: string
          status?: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dispute_detail?: string | null
          dispute_reason?: string
          id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string
          status?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_disputes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "payable_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_disputes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_disputes_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
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
      policies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_user_id: string
          avatar_url: string | null
          commission_rate_pct: number | null
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
          commission_rate_pct?: number | null
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
          commission_rate_pct?: number | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sales_targets: {
        Row: {
          bonus_cents: number
          competencia: string
          created_at: string
          id: string
          meta_batida: boolean
          meta_conversoes: number
          meta_experimentais: number
          meta_faturamento_cents: number
          meta_leads: number
          profile_id: string
          realizado_conversoes: number
          realizado_experimentais: number
          realizado_faturamento_cents: number
          realizado_leads: number
          updated_at: string
        }
        Insert: {
          bonus_cents?: number
          competencia: string
          created_at?: string
          id?: string
          meta_batida?: boolean
          meta_conversoes?: number
          meta_experimentais?: number
          meta_faturamento_cents?: number
          meta_leads?: number
          profile_id: string
          realizado_conversoes?: number
          realizado_experimentais?: number
          realizado_faturamento_cents?: number
          realizado_leads?: number
          updated_at?: string
        }
        Update: {
          bonus_cents?: number
          competencia?: string
          created_at?: string
          id?: string
          meta_batida?: boolean
          meta_conversoes?: number
          meta_experimentais?: number
          meta_faturamento_cents?: number
          meta_leads?: number
          profile_id?: string
          realizado_conversoes?: number
          realizado_experimentais?: number
          realizado_faturamento_cents?: number
          realizado_leads?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_targets_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_executions: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: number
          id: string
          lead_id: string
          next_step_at: string | null
          sequence_id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          lead_id: string
          next_step_at?: string | null
          sequence_id: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          lead_id?: string
          next_step_at?: string | null
          sequence_id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_executions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_executions_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "nurturing_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_logs: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: number | null
          id: string
          lead_id: string
          sequence_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: number | null
          id?: string
          lead_id: string
          sequence_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: number | null
          id?: string
          lead_id?: string
          sequence_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_logs_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "nurturing_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_step_events: {
        Row: {
          created_at: string
          event_type: string
          execution_id: string
          id: string
          step_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          execution_id: string
          id?: string
          step_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          execution_id?: string
          id?: string
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_step_events_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "sequence_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_step_events_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "sequence_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_steps: {
        Row: {
          action_type: string | null
          channel: string
          condition: Json | null
          created_at: string
          delay_hours: number | null
          id: string
          message_content: string | null
          message_template_id: string | null
          order_num: number | null
          sequence_id: string
          step_number: number
        }
        Insert: {
          action_type?: string | null
          channel?: string
          condition?: Json | null
          created_at?: string
          delay_hours?: number | null
          id?: string
          message_content?: string | null
          message_template_id?: string | null
          order_num?: number | null
          sequence_id: string
          step_number: number
        }
        Update: {
          action_type?: string | null
          channel?: string
          condition?: Json | null
          created_at?: string
          delay_hours?: number | null
          id?: string
          message_content?: string | null
          message_template_id?: string | null
          order_num?: number | null
          sequence_id?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "sequence_steps_message_template_id_fkey"
            columns: ["message_template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "nurturing_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          actual_start_time: string | null
          adjusted_at: string | null
          adjusted_by: string | null
          adjustment_reason: string | null
          assistant_hourly_rate_cents: number | null
          assistant_payment_amount_cents: number | null
          assistant_trainer_id: string | null
          cancellation_reason: string | null
          cancellation_within_cutoff: boolean | null
          cancelled_at: string | null
          cancelled_by: string | null
          capacity: number
          contract_id: string | null
          created_at: string
          dispute_reason: string | null
          dispute_resolution: string | null
          disputed_at: string | null
          disputed_by: string | null
          duration_minutes: number
          end_time: string
          id: string
          is_exception: boolean
          is_makeup: boolean
          is_paid: boolean
          late_minutes: number | null
          makeup_credit_id: string | null
          modality: string
          notes: string | null
          original_payment_amount_cents: number | null
          paid_at: string | null
          payment_amount_cents: number | null
          payment_hours: number | null
          resolved_at: string | null
          resolved_by: string | null
          session_date: string
          session_type: Database["public"]["Enums"]["session_type"]
          start_time: string
          status: Database["public"]["Enums"]["full_session_status"]
          student_checkin_at: string | null
          student_checkin_lat: number | null
          student_checkin_lng: number | null
          student_checkin_method:
            | Database["public"]["Enums"]["checkin_method"]
            | null
          student_id: string | null
          template_id: string | null
          trainer_checkin_at: string | null
          trainer_checkin_lat: number | null
          trainer_checkin_lng: number | null
          trainer_checkin_method:
            | Database["public"]["Enums"]["checkin_method"]
            | null
          trainer_hourly_rate_cents: number | null
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          actual_start_time?: string | null
          adjusted_at?: string | null
          adjusted_by?: string | null
          adjustment_reason?: string | null
          assistant_hourly_rate_cents?: number | null
          assistant_payment_amount_cents?: number | null
          assistant_trainer_id?: string | null
          cancellation_reason?: string | null
          cancellation_within_cutoff?: boolean | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          capacity?: number
          contract_id?: string | null
          created_at?: string
          dispute_reason?: string | null
          dispute_resolution?: string | null
          disputed_at?: string | null
          disputed_by?: string | null
          duration_minutes?: number
          end_time: string
          id?: string
          is_exception?: boolean
          is_makeup?: boolean
          is_paid?: boolean
          late_minutes?: number | null
          makeup_credit_id?: string | null
          modality: string
          notes?: string | null
          original_payment_amount_cents?: number | null
          paid_at?: string | null
          payment_amount_cents?: number | null
          payment_hours?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_date: string
          session_type?: Database["public"]["Enums"]["session_type"]
          start_time: string
          status?: Database["public"]["Enums"]["full_session_status"]
          student_checkin_at?: string | null
          student_checkin_lat?: number | null
          student_checkin_lng?: number | null
          student_checkin_method?:
            | Database["public"]["Enums"]["checkin_method"]
            | null
          student_id?: string | null
          template_id?: string | null
          trainer_checkin_at?: string | null
          trainer_checkin_lat?: number | null
          trainer_checkin_lng?: number | null
          trainer_checkin_method?:
            | Database["public"]["Enums"]["checkin_method"]
            | null
          trainer_hourly_rate_cents?: number | null
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          actual_start_time?: string | null
          adjusted_at?: string | null
          adjusted_by?: string | null
          adjustment_reason?: string | null
          assistant_hourly_rate_cents?: number | null
          assistant_payment_amount_cents?: number | null
          assistant_trainer_id?: string | null
          cancellation_reason?: string | null
          cancellation_within_cutoff?: boolean | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          capacity?: number
          contract_id?: string | null
          created_at?: string
          dispute_reason?: string | null
          dispute_resolution?: string | null
          disputed_at?: string | null
          disputed_by?: string | null
          duration_minutes?: number
          end_time?: string
          id?: string
          is_exception?: boolean
          is_makeup?: boolean
          is_paid?: boolean
          late_minutes?: number | null
          makeup_credit_id?: string | null
          modality?: string
          notes?: string | null
          original_payment_amount_cents?: number | null
          paid_at?: string | null
          payment_amount_cents?: number | null
          payment_hours?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_date?: string
          session_type?: Database["public"]["Enums"]["session_type"]
          start_time?: string
          status?: Database["public"]["Enums"]["full_session_status"]
          student_checkin_at?: string | null
          student_checkin_lat?: number | null
          student_checkin_lng?: number | null
          student_checkin_method?:
            | Database["public"]["Enums"]["checkin_method"]
            | null
          student_id?: string | null
          template_id?: string | null
          trainer_checkin_at?: string | null
          trainer_checkin_lat?: number | null
          trainer_checkin_lng?: number | null
          trainer_checkin_method?:
            | Database["public"]["Enums"]["checkin_method"]
            | null
          trainer_hourly_rate_cents?: number | null
          trainer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_assistant_trainer_id_fkey"
            columns: ["assistant_trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_makeup_credit_id_fkey"
            columns: ["makeup_credit_id"]
            isOneToOne: false
            referencedRelation: "makeup_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "class_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
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
      tasks: {
        Row: {
          assignee_id: string
          created_at: string
          data_conclusao: string | null
          data_prevista: string | null
          descricao: string | null
          id: string
          lead_id: string | null
          prioridade: Database["public"]["Enums"]["task_priority"]
          resultado: string | null
          status: Database["public"]["Enums"]["task_status"]
          student_id: string | null
          tipo: Database["public"]["Enums"]["task_type"]
          titulo: string
          updated_at: string
        }
        Insert: {
          assignee_id: string
          created_at?: string
          data_conclusao?: string | null
          data_prevista?: string | null
          descricao?: string | null
          id?: string
          lead_id?: string | null
          prioridade?: Database["public"]["Enums"]["task_priority"]
          resultado?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          student_id?: string | null
          tipo?: Database["public"]["Enums"]["task_type"]
          titulo: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string
          created_at?: string
          data_conclusao?: string | null
          data_prevista?: string | null
          descricao?: string | null
          id?: string
          lead_id?: string | null
          prioridade?: Database["public"]["Enums"]["task_priority"]
          resultado?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          student_id?: string | null
          tipo?: Database["public"]["Enums"]["task_type"]
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      trainers: {
        Row: {
          bank_account: string | null
          bank_agency: string | null
          bank_name: string | null
          bio: string | null
          certifications: string[] | null
          cpf: string | null
          created_at: string
          email: string | null
          full_name: string
          hired_at: string | null
          hourly_rate_assistant_cents: number
          hourly_rate_main_cents: number
          id: string
          is_active: boolean
          notes: string | null
          payment_method: Database["public"]["Enums"]["trainer_payment_method"]
          phone: string | null
          pix_key: string | null
          pix_key_type: string | null
          profile_id: string | null
          session_rate_cents: number
          specialties: string[] | null
          terminated_at: string | null
          updated_at: string
        }
        Insert: {
          bank_account?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          bio?: string | null
          certifications?: string[] | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          hired_at?: string | null
          hourly_rate_assistant_cents?: number
          hourly_rate_main_cents?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["trainer_payment_method"]
          phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          profile_id?: string | null
          session_rate_cents?: number
          specialties?: string[] | null
          terminated_at?: string | null
          updated_at?: string
        }
        Update: {
          bank_account?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          bio?: string | null
          certifications?: string[] | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          hired_at?: string | null
          hourly_rate_assistant_cents?: number
          hourly_rate_main_cents?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["trainer_payment_method"]
          phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          profile_id?: string | null
          session_rate_cents?: number
          specialties?: string[] | null
          terminated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_quotas: {
        Row: {
          date: string
          max_trials: number
          occupied_hours: Json
          trials_booked: number
        }
        Insert: {
          date: string
          max_trials?: number
          occupied_hours?: Json
          trials_booked?: number
        }
        Update: {
          date?: string
          max_trials?: number
          occupied_hours?: Json
          trials_booked?: number
        }
        Relationships: []
      }
      trial_waitlist: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          position: number
          preferred_dates: string[] | null
          preferred_times: string[] | null
          session_type_preference: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          position?: number
          preferred_dates?: string[] | null
          preferred_times?: string[] | null
          session_type_preference?: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          position?: number
          preferred_dates?: string[] | null
          preferred_times?: string[] | null
          session_type_preference?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_waitlist_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
      payable_sessions: {
        Row: {
          assistant_hourly_rate_cents: number | null
          assistant_payment_amount_cents: number | null
          assistant_trainer_id: string | null
          assistant_trainer_name: string | null
          contract_id: string | null
          duration_minutes: number | null
          end_time: string | null
          id: string | null
          is_paid: boolean | null
          modality: string | null
          paid_at: string | null
          payment_amount_cents: number | null
          payment_hours: number | null
          session_date: string | null
          session_type: Database["public"]["Enums"]["session_type"] | null
          start_time: string | null
          status: Database["public"]["Enums"]["full_session_status"] | null
          student_id: string | null
          student_name: string | null
          trainer_hourly_rate_cents: number | null
          trainer_id: string | null
          trainer_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_assistant_trainer_id_fkey"
            columns: ["assistant_trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      calculate_monthly_kpis: { Args: { p_date: string }; Returns: undefined }
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
      update_lead_anamnese: {
        Args: {
          p_email?: string
          p_lead_id: string
          p_name?: string
          p_phone?: string
          p_qualification_details: Json
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "instructor" | "student" | "manager" | "reception"
      booking_status: "confirmed" | "cancelled" | "waitlist" | "no_show"
      checkin_method: "manual" | "qr_code" | "geolocation" | "auto"
      commission_status: "calculada" | "aprovada" | "paga" | "cancelada"
      commission_type: "venda_nova" | "renovacao" | "indicacao" | "meta"
      contract_status: "active" | "suspended" | "cancelled" | "expired"
      expense_status: "pending" | "paid" | "cancelled"
      full_session_status:
        | "scheduled"
        | "cancelled_on_time"
        | "cancelled_late"
        | "no_show"
        | "completed"
        | "disputed"
        | "adjusted"
        | "late_arrival"
      interaction_type:
        | "phone_call"
        | "whatsapp"
        | "email"
        | "visit"
        | "trial_class"
        | "follow_up"
        | "note"
      invoice_status: "pending" | "paid" | "overdue" | "cancelled"
      makeup_credit_status: "available" | "used" | "expired"
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
      session_type: "personal" | "group"
      student_status: "lead" | "active" | "inactive" | "suspended"
      task_priority: "baixa" | "media" | "alta" | "urgente"
      task_status: "pendente" | "em_andamento" | "concluida" | "cancelada"
      task_type:
        | "ligar"
        | "whatsapp"
        | "email"
        | "seguir_experimental"
        | "fechar_venda"
        | "outro"
      trainer_payment_method: "hourly" | "per_session" | "hybrid"
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
      checkin_method: ["manual", "qr_code", "geolocation", "auto"],
      commission_status: ["calculada", "aprovada", "paga", "cancelada"],
      commission_type: ["venda_nova", "renovacao", "indicacao", "meta"],
      contract_status: ["active", "suspended", "cancelled", "expired"],
      expense_status: ["pending", "paid", "cancelled"],
      full_session_status: [
        "scheduled",
        "cancelled_on_time",
        "cancelled_late",
        "no_show",
        "completed",
        "disputed",
        "adjusted",
        "late_arrival",
      ],
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
      makeup_credit_status: ["available", "used", "expired"],
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
      session_type: ["personal", "group"],
      student_status: ["lead", "active", "inactive", "suspended"],
      task_priority: ["baixa", "media", "alta", "urgente"],
      task_status: ["pendente", "em_andamento", "concluida", "cancelada"],
      task_type: [
        "ligar",
        "whatsapp",
        "email",
        "seguir_experimental",
        "fechar_venda",
        "outro",
      ],
      trainer_payment_method: ["hourly", "per_session", "hybrid"],
    },
  },
} as const
