export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admins: {
        Row: {
          created_at: string
          email: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author: string | null
          content_en: string | null
          content_ro: string | null
          cover_url: string | null
          created_at: string
          first_image: string | null
          hidden: boolean
          id: string
          published: boolean
          published_at: string | null
          reading_minutes_en: number | null
          reading_minutes_ro: number | null
          slug: string
          subtitle_en: string | null
          subtitle_ro: string | null
          title_en: string | null
          title_ro: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          content_en?: string | null
          content_ro?: string | null
          cover_url?: string | null
          created_at?: string
          first_image?: string | null
          hidden?: boolean
          id?: string
          published?: boolean
          published_at?: string | null
          reading_minutes_en?: number | null
          reading_minutes_ro?: number | null
          slug: string
          subtitle_en?: string | null
          subtitle_ro?: string | null
          title_en?: string | null
          title_ro: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          content_en?: string | null
          content_ro?: string | null
          cover_url?: string | null
          created_at?: string
          first_image?: string | null
          hidden?: boolean
          id?: string
          published?: boolean
          published_at?: string | null
          reading_minutes_en?: number | null
          reading_minutes_ro?: number | null
          slug?: string
          subtitle_en?: string | null
          subtitle_ro?: string | null
          title_en?: string | null
          title_ro?: string
          updated_at?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          archived_at: string | null
          created_at: string
          email: string
          id: string
          locale: string
          message: string
          name: string
          read_at: string | null
          starred: boolean
          subject: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          email: string
          id?: string
          locale?: string
          message: string
          name: string
          read_at?: string | null
          starred?: boolean
          subject?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          email?: string
          id?: string
          locale?: string
          message?: string
          name?: string
          read_at?: string | null
          starred?: boolean
          subject?: string | null
        }
        Relationships: []
      }
      content_drafts: {
        Row: {
          created_at: string
          data: Json
          event_id: string | null
          id: string
          post_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          event_id?: string | null
          id?: string
          post_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          event_id?: string | null
          id?: string
          post_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_drafts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "admin_event_overview"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "content_drafts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "event_availability"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "content_drafts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_drafts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_en: string | null
          body_ro: string
          id: string
          subject_en: string | null
          subject_ro: string
          type: string
          updated_at: string
        }
        Insert: {
          body_en?: string | null
          body_ro: string
          id?: string
          subject_en?: string | null
          subject_ro: string
          type: string
          updated_at?: string
        }
        Update: {
          body_en?: string | null
          body_ro?: string
          id?: string
          subject_en?: string | null
          subject_ro?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          currency: string
          date: string
          description_en: string | null
          description_ro: string | null
          end_date: string | null
          end_time: string | null
          ends_at: string
          id: string
          image_url: string | null
          location: string | null
          map_link: string | null
          max_participants: number | null
          price: number
          published: boolean
          show_in_archive: boolean
          slug: string
          starts_at: string
          time: string | null
          title_en: string | null
          title_ro: string
          updated_at: string
          whatsapp_group_link: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          date: string
          description_en?: string | null
          description_ro?: string | null
          end_date?: string | null
          end_time?: string | null
          ends_at?: string
          id?: string
          image_url?: string | null
          location?: string | null
          map_link?: string | null
          max_participants?: number | null
          price?: number
          published?: boolean
          show_in_archive?: boolean
          slug: string
          starts_at?: string
          time?: string | null
          title_en?: string | null
          title_ro: string
          updated_at?: string
          whatsapp_group_link?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          date?: string
          description_en?: string | null
          description_ro?: string | null
          end_date?: string | null
          end_time?: string | null
          ends_at?: string
          id?: string
          image_url?: string | null
          location?: string | null
          map_link?: string | null
          max_participants?: number | null
          price?: number
          published?: boolean
          show_in_archive?: boolean
          slug?: string
          starts_at?: string
          time?: string | null
          title_en?: string | null
          title_ro?: string
          updated_at?: string
          whatsapp_group_link?: string | null
        }
        Relationships: []
      }
      faqs: {
        Row: {
          answer_en: string | null
          answer_ro: string
          created_at: string
          id: string
          published: boolean
          question_en: string | null
          question_ro: string
          sort_order: number
        }
        Insert: {
          answer_en?: string | null
          answer_ro: string
          created_at?: string
          id?: string
          published?: boolean
          question_en?: string | null
          question_ro: string
          sort_order?: number
        }
        Update: {
          answer_en?: string | null
          answer_ro?: string
          created_at?: string
          id?: string
          published?: boolean
          question_en?: string | null
          question_ro?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      registrations: {
        Row: {
          admin_note: string | null
          created_at: string
          email: string
          event_id: string
          full_name: string
          id: string
          locale: string
          marketing_consent_at: string | null
          note_consent_at: string | null
          participant_note: string | null
          payment_status: string
          phone: string
          refund_requested_at: string | null
          removal_reason: string | null
          removed_at: string | null
          stripe_session_id: string | null
          user_id: string | null
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          email: string
          event_id: string
          full_name: string
          id?: string
          locale?: string
          marketing_consent_at?: string | null
          note_consent_at?: string | null
          participant_note?: string | null
          payment_status?: string
          phone: string
          refund_requested_at?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          stripe_session_id?: string | null
          user_id?: string | null
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          email?: string
          event_id?: string
          full_name?: string
          id?: string
          locale?: string
          marketing_consent_at?: string | null
          note_consent_at?: string | null
          participant_note?: string | null
          payment_status?: string
          phone?: string
          refund_requested_at?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          stripe_session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "admin_event_overview"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_availability"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_content: {
        Row: {
          field_type: string
          key: string
          label_ro: string
          section: string
          sort_order: number
          updated_at: string
          value_en: string | null
          value_ro: string
        }
        Insert: {
          field_type?: string
          key: string
          label_ro?: string
          section?: string
          sort_order?: number
          updated_at?: string
          value_en?: string | null
          value_ro?: string
        }
        Update: {
          field_type?: string
          key?: string
          label_ro?: string
          section?: string
          sort_order?: number
          updated_at?: string
          value_en?: string | null
          value_ro?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          approved: boolean
          author_name: string | null
          content: string
          created_at: string
          event_id: string
          id: string
          rating: number | null
          type: string
          user_id: string | null
          video_url: string | null
        }
        Insert: {
          approved?: boolean
          author_name?: string | null
          content: string
          created_at?: string
          event_id: string
          id?: string
          rating?: number | null
          type: string
          user_id?: string | null
          video_url?: string | null
        }
        Update: {
          approved?: boolean
          author_name?: string | null
          content?: string
          created_at?: string
          event_id?: string
          id?: string
          rating?: number | null
          type?: string
          user_id?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "testimonials_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "admin_event_overview"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "testimonials_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_availability"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "testimonials_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waiting_list: {
        Row: {
          claim_expires_at: string | null
          claimed_at: string | null
          claimed_registration_id: string | null
          created_at: string
          email: string
          event_id: string
          full_name: string
          id: string
          locale: string
          notified_at: string | null
          phone: string
          removal_reason: string | null
          removed_at: string | null
        }
        Insert: {
          claim_expires_at?: string | null
          claimed_at?: string | null
          claimed_registration_id?: string | null
          created_at?: string
          email: string
          event_id: string
          full_name: string
          id?: string
          locale?: string
          notified_at?: string | null
          phone: string
          removal_reason?: string | null
          removed_at?: string | null
        }
        Update: {
          claim_expires_at?: string | null
          claimed_at?: string | null
          claimed_registration_id?: string | null
          created_at?: string
          email?: string
          event_id?: string
          full_name?: string
          id?: string
          locale?: string
          notified_at?: string | null
          phone?: string
          removal_reason?: string | null
          removed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waiting_list_claimed_registration_id_fkey"
            columns: ["claimed_registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_list_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "admin_event_overview"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "waiting_list_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_availability"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "waiting_list_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      waiting_list_notifications: {
        Row: {
          batch_number: number
          created_at: string
          event_id: string
          expires_at: string
          id: string
          spots_opened: number
        }
        Insert: {
          batch_number: number
          created_at?: string
          event_id: string
          expires_at: string
          id?: string
          spots_opened?: number
        }
        Update: {
          batch_number?: number
          created_at?: string
          event_id?: string
          expires_at?: string
          id?: string
          spots_opened?: number
        }
        Relationships: [
          {
            foreignKeyName: "waiting_list_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "admin_event_overview"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "waiting_list_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_availability"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "waiting_list_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_links: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          label: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          label: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_dashboard: {
        Row: {
          active_events: number | null
          draft_posts: number | null
          pending_payments: number | null
          pending_testimonials: number | null
          unread_messages: number | null
        }
        Relationships: []
      }
      admin_event_overview: {
        Row: {
          capacity: number | null
          event_id: string | null
          offers_open: number | null
          pending_payments: number | null
          refund_requested: number | null
          refunded: number | null
          status: string | null
          taken: number | null
          waiting: number | null
        }
        Relationships: []
      }
      event_availability: {
        Row: {
          capacity: number | null
          event_id: string | null
          taken: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      holds_seat: {
        Args: { r: Database["public"]["Tables"]["registrations"]["Row"] }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      pending_hold_interval: { Args: never; Returns: string }
      publish_event_draft: { Args: { p_event_id: string }; Returns: undefined }
      publish_post_draft: { Args: { p_post_id: string }; Returns: undefined }
      register_for_event: {
        Args: {
          p_email: string
          p_event_id: string
          p_full_name: string
          p_locale?: string
          p_marketing_opt_in?: boolean
          p_participant_note?: string
          p_payment_status?: string
          p_phone: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

