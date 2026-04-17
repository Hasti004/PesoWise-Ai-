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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          content_type: string
          created_at: string | null
          expense_id: string
          file_url: string
          filename: string
          id: string
          line_item_id: string | null
          uploaded_by: string
        }
        Insert: {
          content_type: string
          created_at?: string | null
          expense_id: string
          file_url: string
          filename: string
          id?: string
          line_item_id?: string | null
          uploaded_by: string
        }
        Update: {
          content_type?: string
          created_at?: string | null
          expense_id?: string
          file_url?: string
          filename?: string
          id?: string
          line_item_id?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "expense_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          comment: string | null
          created_at: string | null
          expense_id: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          comment?: string | null
          created_at?: string | null
          expense_id: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          comment?: string | null
          created_at?: string | null
          expense_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_line_items: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string | null
          date: string
          description: string | null
          expense_id: string
          id: string
        }
        Insert: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at?: string | null
          date: string
          description?: string | null
          expense_id: string
          id?: string
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string | null
          date?: string
          description?: string | null
          expense_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_line_items_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          admin_comment: string | null
          assigned_engineer_id: string | null
          created_at: string | null
          destination: string
          id: string
          purpose: string | null
          status: Database["public"]["Enums"]["expense_status"]
          title: string
          total_amount: number | null
          trip_end: string
          trip_start: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_comment?: string | null
          assigned_engineer_id?: string | null
          created_at?: string | null
          destination: string
          id?: string
          purpose?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          title: string
          total_amount?: number | null
          trip_end: string
          trip_start: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_comment?: string | null
          assigned_engineer_id?: string | null
          created_at?: string | null
          destination?: string
          id?: string
          purpose?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          title?: string
          total_amount?: number | null
          trip_end?: string
          trip_start?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          balance: number | null
          is_active: boolean | null
          name: string
          updated_at: string | null
          user_id: string
          reporting_engineer_id: string | null
          cashier_assigned_engineer_id: string | null
          assigned_cashier_id: string | null
          cashier_assigned_location_id: string | null
          organization_id: string | null
          is_master_admin: boolean | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          balance?: number | null
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          user_id: string
          reporting_engineer_id?: string | null
          cashier_assigned_engineer_id?: string | null
          assigned_cashier_id?: string | null
          cashier_assigned_location_id?: string | null
          organization_id?: string | null
          is_master_admin?: boolean | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          balance?: number | null
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          user_id?: string
          reporting_engineer_id?: string | null
          cashier_assigned_engineer_id?: string | null
          assigned_cashier_id?: string | null
          cashier_assigned_location_id?: string | null
          organization_id?: string | null
          is_master_admin?: boolean | null
        }
        Relationships: []
      }
      master_admin_memberships: {
        Row: {
          id: string
          user_id: string
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      organization_memberships: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: string
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role: string
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          role?: string
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      organization_settings: {
        Row: {
          id: string
          organization_id: string
          engineer_approval_limit: number | null
          attachment_required_above_amount: number | null
          allow_cashier_expense_submission: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          engineer_approval_limit?: number | null
          attachment_required_above_amount?: number | null
          allow_cashier_expense_submission?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          engineer_approval_limit?: number | null
          attachment_required_above_amount?: number | null
          allow_cashier_expense_submission?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          plan: string | null
          logo_url: string | null
          payment_status: string | null
          is_blocked: boolean | null
          last_activity_at: string | null
          created_at: string | null
          updated_at: string | null
          max_users: number | null
        }
        Insert: {
          id?: string
          name: string
          slug: string
          plan?: string | null
          logo_url?: string | null
          payment_status?: string | null
          is_blocked?: boolean | null
          last_activity_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          max_users?: number | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          plan?: string | null
          logo_url?: string | null
          payment_status?: string | null
          is_blocked?: boolean | null
          last_activity_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          max_users?: number | null
        }
        Relationships: []
      }
      contact_leads: {
        Row: {
          id: string
          full_name: string
          work_email: string
          company: string
          phone: string | null
          role: string | null
          team_size: string | null
          multi_level: boolean
          balance: boolean
          multi_location: boolean
          receipts: boolean
          message: string | null
          consent_privacy: boolean
          consent_marketing: boolean | null
          consent_timestamp: string | null
          consent_version: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          full_name: string
          work_email: string
          company: string
          phone?: string | null
          role?: string | null
          team_size?: string | null
          multi_level?: boolean
          balance?: boolean
          multi_location?: boolean
          receipts?: boolean
          message?: string | null
          consent_privacy?: boolean
          consent_marketing?: boolean | null
          consent_timestamp?: string | null
          consent_version?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          full_name?: string
          work_email?: string
          company?: string
          phone?: string | null
          role?: string | null
          team_size?: string | null
          multi_level?: boolean
          balance?: boolean
          multi_location?: boolean
          receipts?: boolean
          message?: string | null
          consent_privacy?: boolean
          consent_marketing?: boolean | null
          consent_timestamp?: string | null
          consent_version?: number | null
          created_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          id: string
          name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      engineer_locations: {
        Row: {
          id: string
          engineer_id: string
          location_id: string
          organization_id: string
          created_at: string
        }
        Insert: {
          id?: string
          engineer_id: string
          location_id: string
          organization_id: string
          created_at?: string
        }
        Update: {
          id?: string
          engineer_id?: string
          location_id?: string
          organization_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineer_locations_engineer_id_fkey"
            columns: ["engineer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engineer_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          title: string
          message: string
          expense_id: string | null
          read: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          title: string
          message: string
          expense_id?: string | null
          read?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          title?: string
          message?: string
          expense_id?: string | null
          read?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      money_assignments: {
        Row: {
          id: string
          cashier_id: string
          recipient_id: string
          amount: number
          assigned_at: string
          returned_at: string | null
          is_returned: boolean
          return_transaction_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cashier_id: string
          recipient_id: string
          amount: number
          assigned_at?: string
          returned_at?: string | null
          is_returned?: boolean
          return_transaction_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cashier_id?: string
          recipient_id?: string
          amount?: number
          assigned_at?: string
          returned_at?: string | null
          is_returned?: boolean
          return_transaction_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_assignments_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_assignments_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      money_return_requests: {
        Row: {
          id: string
          requester_id: string
          cashier_id: string
          amount: number
          status: string
          requested_at: string
          approved_at: string | null
          rejected_at: string | null
          approved_by: string | null
          rejected_by: string | null
          rejection_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          requester_id: string
          cashier_id: string
          amount: number
          status?: string
          requested_at?: string
          approved_at?: string | null
          rejected_at?: string | null
          approved_by?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          requester_id?: string
          cashier_id?: string
          amount?: number
          status?: string
          requested_at?: string
          approved_at?: string | null
          rejected_at?: string | null
          approved_by?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_return_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_return_requests_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
      sync_engineers_with_location_cashier: {
        Args: {
          location_id_param: string
        }
        Returns: undefined
      }
      get_cashier_for_engineer: {
        Args: {
          engineer_user_id: string
        }
        Returns: string | null
      }
      get_storage_metrics: {
        Args: Record<string, never>
        Returns: Json
      }
      assign_user_to_organization: {
        Args: {
          p_user_id: string
          p_organization_id: string
          p_role?: string
        }
        Returns: undefined
      }
      get_organization_member_counts: {
        Args: {
          org_ids?: string[] | null
        }
        Returns: {
          organization_id: string
          member_count: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "engineer" | "employee" | "cashier" | "master_admin"
      expense_category: "travel" | "lodging" | "food" | "other"
      expense_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "verified"
        | "approved"
        | "rejected"
        | "paid"
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
      app_role: ["admin", "engineer", "employee"],
      expense_category: ["travel", "lodging", "food", "other"],
      expense_status: [
        "draft",
        "submitted",
        "under_review",
        "verified",
        "approved",
        "rejected",
        "paid",
      ],
    },
  },
} as const
