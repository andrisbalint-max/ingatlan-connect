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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          city: string | null
          created_at: string
          domain: string | null
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
          created_at: string
          follow_up_number: number
          id: string
          organization_id: string
          scheduled_for: string | null
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
          created_at?: string
          follow_up_number?: number
          id?: string
          organization_id: string
          scheduled_for?: string | null
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
          created_at?: string
          follow_up_number?: number
          id?: string
          organization_id?: string
          scheduled_for?: string | null
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
        ]
      }
      market_reports: {
        Row: {
          created_at: string
          id: string
          key_data: Json
          organization_id: string
          report_date: string | null
          source_name: string | null
          summary: string | null
          title: string
          year: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          key_data?: Json
          organization_id: string
          report_date?: string | null
          source_name?: string | null
          summary?: string | null
          title: string
          year?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          key_data?: Json
          organization_id?: string
          report_date?: string | null
          source_name?: string | null
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
          organization_id: string
          size_sqm: number | null
          status: string
          title: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          description?: string | null
          id?: string
          organization_id: string
          size_sqm?: number | null
          status?: string
          title: string
        }
        Update: {
          city?: string | null
          created_at?: string
          description?: string | null
          id?: string
          organization_id?: string
          size_sqm?: number | null
          status?: string
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
          handled: boolean
          id: string
          organization_id: string
          raw_text: string | null
          received_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["response_category"] | null
          created_at?: string
          email_id?: string | null
          handled?: boolean
          id?: string
          organization_id: string
          raw_text?: string | null
          received_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["response_category"] | null
          created_at?: string
          email_id?: string | null
          handled?: boolean
          id?: string
          organization_id?: string
          raw_text?: string | null
          received_at?: string
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
          created_at: string
          daily_email_limit: number
          hunter_api_key: string | null
          id: string
          openai_api_key: string | null
          organization_id: string
          outlook_connected: boolean
          send_window_end: string
          send_window_start: string
        }
        Insert: {
          created_at?: string
          daily_email_limit?: number
          hunter_api_key?: string | null
          id?: string
          openai_api_key?: string | null
          organization_id: string
          outlook_connected?: boolean
          send_window_end?: string
          send_window_start?: string
        }
        Update: {
          created_at?: string
          daily_email_limit?: number
          hunter_api_key?: string | null
          id?: string
          openai_api_key?: string | null
          organization_id?: string
          outlook_connected?: boolean
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
    }
    Enums: {
      app_role: "admin" | "user" | "viewer"
      company_status: "nincs_valasz" | "valaszolt" | "erdeklodik" | "lezarva"
      email_status: "varakozik" | "jovahagyva" | "elkuldot" | "elvetve"
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
      email_status: ["varakozik", "jovahagyva", "elkuldot", "elvetve"],
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
