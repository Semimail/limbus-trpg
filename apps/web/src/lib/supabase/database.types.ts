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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      campaign_invites: {
        Row: {
          campaign_id: string
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          max_uses: number | null
          uses: number
        }
        Insert: {
          campaign_id: string
          code: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          uses?: number
        }
        Update: {
          campaign_id?: string
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_invites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_members: {
        Row: {
          campaign_id: string
          joined_at: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          campaign_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          campaign_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_members_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          rules: Json
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          rules?: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          rules?: Json
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          approved: boolean
          campaign_id: string | null
          created_at: string
          data: Json
          id: string
          locked: boolean
          name: string
          owner_id: string
          portrait_url: string | null
          updated_at: string
        }
        Insert: {
          approved?: boolean
          campaign_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          locked?: boolean
          name: string
          owner_id: string
          portrait_url?: string | null
          updated_at?: string
        }
        Update: {
          approved?: boolean
          campaign_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          locked?: boolean
          name?: string
          owner_id?: string
          portrait_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "characters_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "characters_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      combat_events: {
        Row: {
          combat_id: string
          created_at: string
          event: Json
          id: number
          seq: number
        }
        Insert: {
          combat_id: string
          created_at?: string
          event: Json
          id?: never
          seq: number
        }
        Update: {
          combat_id?: string
          created_at?: string
          event?: Json
          id?: never
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "combat_events_combat_id_fkey"
            columns: ["combat_id"]
            isOneToOne: false
            referencedRelation: "combats"
            referencedColumns: ["id"]
          },
        ]
      }
      combats: {
        Row: {
          created_at: string
          id: string
          phase: string
          rng_state: number | null
          round: number
          scene_id: string | null
          session_id: string
          state: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          phase?: string
          rng_state?: number | null
          round?: number
          scene_id?: string | null
          session_id: string
          state?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          phase?: string
          rng_state?: number | null
          round?: number
          scene_id?: string | null
          session_id?: string
          state?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "combats_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combats_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      enemies: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string
          data: Json
          id: string
          name: string
          portrait_url: string | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by: string
          data?: Json
          id?: string
          name: string
          portrait_url?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string
          data?: Json
          id?: string
          name?: string
          portrait_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enemies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enemies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enemy_reveals: {
        Row: {
          character_id: string
          enemy_id: string
          met_at: string
          revealed_gimmicks: string[]
          revealed_skills: string[]
        }
        Insert: {
          character_id: string
          enemy_id: string
          met_at?: string
          revealed_gimmicks?: string[]
          revealed_skills?: string[]
        }
        Update: {
          character_id?: string
          enemy_id?: string
          met_at?: string
          revealed_gimmicks?: string[]
          revealed_skills?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "enemy_reveals_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enemy_reveals_enemy_id_fkey"
            columns: ["enemy_id"]
            isOneToOne: false
            referencedRelation: "enemies"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_id: string | null
          character_id: string | null
          content: string
          created_at: string
          id: number
          kind: Database["public"]["Enums"]["message_kind"]
          payload: Json | null
          scene_id: string | null
          session_id: string
          to_user_id: string | null
        }
        Insert: {
          author_id?: string | null
          character_id?: string | null
          content?: string
          created_at?: string
          id?: never
          kind?: Database["public"]["Enums"]["message_kind"]
          payload?: Json | null
          scene_id?: string | null
          session_id: string
          to_user_id?: string | null
        }
        Update: {
          author_id?: string | null
          character_id?: string | null
          content?: string
          created_at?: string
          id?: never
          kind?: Database["public"]["Enums"]["message_kind"]
          payload?: Json | null
          scene_id?: string | null
          session_id?: string
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          discord_id: string | null
          id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          discord_id?: string | null
          id: string
          username?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          discord_id?: string | null
          id?: string
          username?: string
        }
        Relationships: []
      }
      scenes: {
        Row: {
          board: Json
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["scene_kind"]
          order_index: number
          session_id: string
          title: string
        }
        Insert: {
          board?: Json
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["scene_kind"]
          order_index?: number
          session_id: string
          title: string
        }
        Update: {
          board?: Json
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["scene_kind"]
          order_index?: number
          session_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          campaign_id: string
          created_by: string
          ended_at: string | null
          id: string
          seed: string
          started_at: string
          status: Database["public"]["Enums"]["session_status"]
          title: string
        }
        Insert: {
          campaign_id: string
          created_by: string
          ended_at?: string | null
          id?: string
          seed?: string
          started_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          title: string
        }
        Update: {
          campaign_id?: string
          created_by?: string
          ended_at?: string | null
          id?: string
          seed?: string
          started_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_gm: { Args: { cid: string }; Returns: boolean }
      is_member: { Args: { cid: string }; Returns: boolean }
      is_owner_gm: { Args: { cid: string }; Returns: boolean }
      join_campaign: { Args: { invite_code: string }; Returns: string }
      session_campaign: { Args: { sid: string }; Returns: string }
    }
    Enums: {
      member_role: "gm" | "temp_gm" | "player"
      message_kind: "ic" | "ooc" | "gm" | "system" | "whisper"
      scene_kind: "drama" | "explore" | "combat"
      session_status: "open" | "closed"
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
  public: {
    Enums: {
      member_role: ["gm", "temp_gm", "player"],
      message_kind: ["ic", "ooc", "gm", "system", "whisper"],
      scene_kind: ["drama", "explore", "combat"],
      session_status: ["open", "closed"],
    },
  },
} as const
