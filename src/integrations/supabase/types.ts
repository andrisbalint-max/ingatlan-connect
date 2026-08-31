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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          city: string | null
          created_at: string
          domain: string | null
          follow_up_paused_until: string | null
          hunter_searched: boolean
          id: string
          industry: string | null
          name: string
          notes: string | null
          opt_out: boolean
          organization_id: string
          status: Database["public"]["Enums"]["company_status"]
        }
        Insert: {
          city?: string | null
          created_at?: string
          domain?: string | null
          follow_up_paused_until?: string | null
          hunter_searched?: boolean
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          opt_out?: boolean
          organization_id: string
          status?: Database["public"]["Enums"]["company_status"]
        }
        Update: {
          city?: string | null
          created_at?: string
          domain?: string | null
          follow_up_paused_until?: string | null
          hunter_searched?: boolean
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          opt_out?: boolean
          organization_id?: string
          status?: Database["public"]["Enums"]["company_status"]
        }
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_id: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          organization_id: string
          phone: string | null
          position: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          organization_id: string
          phone?: string | null
          position?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
          position?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_digests: {
        Row: {
          content_markdown: string | null
          created_at: string
          date: string
          id: string
          organization_id: string
        }
        Insert: {
          content_markdown?: string | null
          created_at?: string
          date?: string
          id?: string
          organization_id: string
        }
        Update: {
          content_markdown?: string | null
          created_at?: string
          date?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_digests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      emails_queue: {
        Row: {
          ai_generated: boolean
          approved_at: string | null
          body: string | null
          company_id: string | null
          contact_id: string | null
          context_note: string | null
          conversation_id: string | null
          created_at: string
          follow_up_number: number
          graph_message_id: string | null
          id: string
          last_error: string | null
          organization_id: string
          project_id: string | null
          scheduled_for: string | null
          send_attempts: number
          sent_at: string | null
          status: Database["public"]["Enums"]["email_status"]
          subject: string | null
        }
        Insert: {
          ai_generated?: boolean
          approved_at?: string | null
          body?: string | null
          company_id?: string | null
          contact_id?: string | null
          context_note?: string | null
          conversation_id?: string | null
          created_at?: string
          follow_up_number?: number
          graph_message_id?: string | null
          id?: string
          last_error?: string | null
          organization_id: string
          project_id?: string | null
          scheduled_for?: string | null
          send_attempts?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject?: string | null
        }
        Update: {
          ai_generated?: boolean
          approved_at?: string | null
          body?: string | null
          company_id?: string | null
          contact_id?: string | null
          context_note?: string | null
          conversation_id?: string | null
          created_at?: string
          follow_up_number?: number
          graph_message_id?: string | null
          id?: string
          last_error?: string | null
          organization_id?: string
          project_id?: string | null
          scheduled_for?: string | null
          send_attempts?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_queue_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_queue_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      market_reports: {
        Row: {
          created_at: string
          id: string
          key_data: Json
          organization_id: string
          pdf_path: string | null
          report_date: string | null
          source_name: string | null
          source_url: string | null
          summary: string | null
          title: string
          year: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          key_data?: Json
          organization_id: string
          pdf_path?: string | null
          report_date?: string | null
          source_name?: string | null
          source_url?: string | null
          summary?: string | null
          title: string
          year?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          key_data?: Json
          organization_id?: string
          pdf_path?: string | null
          report_date?: string | null
          source_name?: string | null
          source_url?: string | null
          summary?: string | null
          title?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      opten_prospects: {
        Row: {
          city: string | null
          company_id: string | null
          company_name: string
          created_at: string
          domain: string | null
          found_contacts: Json
          hunter_status: string
          id: string
          net_revenue_band: string | null
          organization_id: string
          project_id: string
          promoted_to_crm: boolean
          raw_opten_data: Json | null
          teaor_code: string | null
          teaor_description: string | null
        }
        Insert: {
          city?: string | null
          company_id?: string | null
          company_name: string
          created_at?: string
          domain?: string | null
          found_contacts?: Json
          hunter_status?: string
          id?: string
          net_revenue_band?: string | null
          organization_id: string
          project_id: string
          promoted_to_crm?: boolean
          raw_opten_data?: Json | null
          teaor_code?: string | null
          teaor_description?: string | null
        }
        Update: {
          city?: string | null
          company_id?: string | null
          company_name?: string
          created_at?: string
          domain?: string | null
          found_contacts?: Json
          hunter_status?: string
          id?: string
          net_revenue_band?: string | null
          organization_id?: string
          project_id?: string
          promoted_to_crm?: boolean
          raw_opten_data?: Json | null
          teaor_code?: string | null
          teaor_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opten_prospects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opten_prospects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opten_prospects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      outlook_connections: {
        Row: {
          account_email: string
          created_at: string
          id: string
          organization_id: string
          refresh_token_ciphertext: string
          updated_at: string
        }
        Insert: {
          account_email: string
          created_at?: string
          id?: string
          organization_id: string
          refresh_token_ciphertext: string
          updated_at?: string
        }
        Update: {
          account_email?: string
          created_at?: string
          id?: string
          organization_id?: string
          refresh_token_ciphertext?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outlook_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string
          created_at: string
          email: string
          id: string
          name: string | null
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          email: string
          id?: string
          name?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_companies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          match_reason: string | null
          organization_id: string
          project_id: string
          source: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          match_reason?: string | null
          organization_id: string
          project_id: string
          source?: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          match_reason?: string | null
          organization_id?: string
          project_id?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_companies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_files: {
        Row: {
          ai_summary: string | null
          filename: string
          id: string
          organization_id: string
          project_id: string | null
          storage_path: string | null
          uploaded_at: string
        }
        Insert: {
          ai_summary?: string | null
          filename: string
          id?: string
          organization_id: string
          project_id?: string | null
          storage_path?: string | null
          uploaded_at?: string
        }
        Update: {
          ai_summary?: string | null
          filename?: string
          id?: string
          organization_id?: string
          project_id?: string | null
          storage_path?: string | null
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          city: string | null
          created_at: string
          description: string | null
          id: string
          opten_search_criteria: Json | null
          organization_id: string
          size_sqm: number | null
          status: string
          target_audience: string | null
          title: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          description?: string | null
          id?: string
          opten_search_criteria?: Json | null
          organization_id: string
          size_sqm?: number | null
          status?: string
          target_audience?: string | null
          title: string
        }
        Update: {
          city?: string | null
          created_at?: string
          description?: string | null
          id?: string
          opten_search_criteria?: Json | null
          organization_id?: string
          size_sqm?: number | null
          status?: string
          target_audience?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      responses: {
        Row: {
          category: Database["public"]["Enums"]["response_category"] | null
          created_at: string
          email_id: string | null
          graph_message_id: string | null
          handled: boolean
          id: string
          organization_id: string
          raw_text: string | null
          received_at: string
          seen: boolean
        }
        Insert: {
          category?: Database["public"]["Enums"]["response_category"] | null
          created_at?: string
          email_id?: string | null
          graph_message_id?: string | null
          handled?: boolean
          id?: string
          organization_id: string
          raw_text?: string | null
          received_at?: string
          seen?: boolean
        }
        Update: {
          category?: Database["public"]["Enums"]["response_category"] | null
          created_at?: string
          email_id?: string | null
          graph_message_id?: string | null
          handled?: boolean
          id?: string
          organization_id?: string
          raw_text?: string | null
          received_at?: string
          seen?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "responses_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          ai_budget_warning_sent_at: string | null
          ai_provider_out_of_credit: boolean
          ai_usage_estimated_usd: number
          anthropic_api_key: string | null
          created_at: string
          daily_email_limit: number
          follow_up_schedule: Json
          hunter_api_key: string | null
          id: string
          monthly_ai_budget_usd: number | null
          openai_api_key: string | null
          opten_api_key: string | null
          opten_revenue_bands: Json
          organization_id: string
          outlook_connected: boolean
          preferred_ai_provider: string
          send_window_end: string
          send_window_start: string
        }
        Insert: {
          ai_budget_warning_sent_at?: string | null
          ai_provider_out_of_credit?: boolean
          ai_usage_estimated_usd?: number
          anthropic_api_key?: string | null
          created_at?: string
          daily_email_limit?: number
          follow_up_schedule?: Json
          hunter_api_key?: string | null
          id?: string
          monthly_ai_budget_usd?: number | null
          openai_api_key?: string | null
          opten_api_key?: string | null
          opten_revenue_bands?: Json
          organization_id: string
          outlook_connected?: boolean
          preferred_ai_provider?: string
          send_window_end?: string
          send_window_start?: string
        }
        Update: {
          ai_budget_warning_sent_at?: string | null
          ai_provider_out_of_credit?: boolean
          ai_usage_estimated_usd?: number
          anthropic_api_key?: string | null
          created_at?: string
          daily_email_limit?: number
          follow_up_schedule?: Json
          hunter_api_key?: string | null
          id?: string
          monthly_ai_budget_usd?: number | null
          openai_api_key?: string | null
          opten_api_key?: string | null
          opten_revenue_bands?: Json
          organization_id?: string
          outlook_connected?: boolean
          preferred_ai_provider?: string
          send_window_end?: string
          send_window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_org_id: { Args: never; Returns: string }
      current_role_is: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      ensure_profile: {
        Args: never
        Returns: {
          auth_user_id: string
          created_at: string
          email: string
          id: string
          name: string | null
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      schedule_cron_job: {
        Args: { job_command: string; job_name: string; job_schedule: string }
        Returns: number
      }
      unschedule_cron_job: { Args: { job_name: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "viewer"
      company_status: "nincs_valasz" | "valaszolt" | "erdeklodik" | "lezarva"
      email_status:
        | "varakozik"
        | "jovahagyva"
        | "elkuldot"
        | "elvetve"
        | "szerkesztett"
      response_category:
        | "erdeklodes"
        | "talalkozo"
        | "elutasitas"
        | "kerdes"
        | "autovalasz"
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
      app_role: ["admin", "user", "viewer"],
      company_status: ["nincs_valasz", "valaszolt", "erdeklodik", "lezarva"],
      email_status: [
        "varakozik",
        "jovahagyva",
        "elkuldot",
        "elvetve",
        "szerkesztett",
      ],
      response_category: [
        "erdeklodes",
        "talalkozo",
        "elutasitas",
        "kerdes",
        "autovalasz",
      ],
    },
  },
} as const
