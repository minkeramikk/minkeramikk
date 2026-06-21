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
      designs: {
        Row: {
          accepts_custom_notes: boolean
          active: boolean
          code: string | null
          description_en: string | null
          description_no: string | null
          id: string
          name: string
          preview_image: string | null
          slug: string
          sort_order: number
          supplier_id: string
        }
        Insert: {
          accepts_custom_notes?: boolean
          active?: boolean
          code?: string | null
          description_en?: string | null
          description_no?: string | null
          id?: string
          name: string
          preview_image?: string | null
          slug: string
          sort_order?: number
          supplier_id: string
        }
        Update: {
          accepts_custom_notes?: boolean
          active?: boolean
          code?: string | null
          description_en?: string | null
          description_no?: string | null
          id?: string
          name?: string
          preview_image?: string | null
          slug?: string
          sort_order?: number
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "designs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "public_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_configs: {
        Row: {
          created_at: string | null
          id: string
          kind: string
          label_en: string | null
          label_no: string | null
          payload: string
          sort_order: number
          thumb_image: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          kind: string
          label_en?: string | null
          label_no?: string | null
          payload: string
          sort_order?: number
          thumb_image: string
        }
        Update: {
          created_at?: string | null
          id?: string
          kind?: string
          label_en?: string | null
          label_no?: string | null
          payload?: string
          sort_order?: number
          thumb_image?: string
        }
        Relationships: []
      }
      option_categories: {
        Row: {
          design_id: string
          id: string
          kind: string
          label_en: string | null
          label_no: string | null
          layer_slot: string | null
          slug: string
          sort_order: number
          sync_group: string | null
        }
        Insert: {
          design_id: string
          id?: string
          kind: string
          label_en?: string | null
          label_no?: string | null
          layer_slot?: string | null
          slug: string
          sort_order?: number
          sync_group?: string | null
        }
        Update: {
          design_id?: string
          id?: string
          kind?: string
          label_en?: string | null
          label_no?: string | null
          layer_slot?: string | null
          slug?: string
          sort_order?: number
          sync_group?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "option_categories_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
        ]
      }
      options: {
        Row: {
          active: boolean
          category_id: string
          code: string | null
          hex: string | null
          id: string
          image: string | null
          is_default: boolean
          layer_image: string | null
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          category_id: string
          code?: string | null
          hex?: string | null
          id?: string
          image?: string | null
          is_default?: boolean
          layer_image?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          category_id?: string
          code?: string | null
          hex?: string | null
          id?: string
          image?: string | null
          is_default?: boolean
          layer_image?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "options_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "option_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          config_code: string | null
          config_snapshot: Json | null
          currency_snapshot: string
          id: string
          order_id: string
          price_cents_snapshot: number
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          supplier_id: string
          supplier_name_snapshot: string
        }
        Insert: {
          config_code?: string | null
          config_snapshot?: Json | null
          currency_snapshot: string
          id?: string
          order_id: string
          price_cents_snapshot: number
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          supplier_id: string
          supplier_name_snapshot: string
        }
        Update: {
          config_code?: string | null
          config_snapshot?: Json | null
          currency_snapshot?: string
          id?: string
          order_id?: string
          price_cents_snapshot?: number
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          supplier_id?: string
          supplier_name_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "public_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address: string | null
          code: string
          country: string | null
          created_at: string
          customer_name: string
          email: string
          id: string
          internal_notes: string | null
          locale: string
          message: string | null
          phone: string | null
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
          zipcode: string | null
        }
        Insert: {
          address?: string | null
          code: string
          country?: string | null
          created_at?: string
          customer_name: string
          email: string
          id?: string
          internal_notes?: string | null
          locale: string
          message?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          zipcode?: string | null
        }
        Update: {
          address?: string | null
          code?: string
          country?: string | null
          created_at?: string
          customer_name?: string
          email?: string
          id?: string
          internal_notes?: string | null
          locale?: string
          message?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          zipcode?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          currency: string
          description_en: string | null
          description_no: string | null
          id: string
          image: string | null
          name_en: string
          name_no: string
          pieces: number
          price_cents: number
          slug: string
          sort_order: number
          supplier_id: string
          visible: boolean
        }
        Insert: {
          currency?: string
          description_en?: string | null
          description_no?: string | null
          id?: string
          image?: string | null
          name_en: string
          name_no: string
          pieces?: number
          price_cents: number
          slug: string
          sort_order?: number
          supplier_id: string
          visible?: boolean
        }
        Update: {
          currency?: string
          description_en?: string | null
          description_no?: string | null
          id?: string
          image?: string | null
          name_en?: string
          name_no?: string
          pieces?: number
          price_cents?: number
          slug?: string
          sort_order?: number
          supplier_id?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "public_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          color_accent: string
          color_dark: string
          color_light: string
          id: number
          updated_at: string
        }
        Insert: {
          color_accent: string
          color_dark: string
          color_light: string
          id: number
          updated_at?: string
        }
        Update: {
          color_accent?: string
          color_dark?: string
          color_light?: string
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          active: boolean
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          sort_order: number
        }
        Insert: {
          active?: boolean
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          sort_order?: number
        }
        Update: {
          active?: boolean
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      public_suppliers: {
        Row: {
          active: boolean | null
          id: string | null
          name: string | null
        }
        Insert: {
          active?: boolean | null
          id?: string | null
          name?: string | null
        }
        Update: {
          active?: boolean | null
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_order: {
        Args: {
          p_address?: string
          p_country?: string
          p_customer_name: string
          p_email: string
          p_items: Json
          p_locale: string
          p_message: string
          p_phone: string
          p_zipcode?: string
        }
        Returns: string
      }
    }
    Enums: {
      order_status:
        | "new"
        | "contacted"
        | "confirmed"
        | "in_production"
        | "delivered"
        | "cancelled"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      order_status: [
        "new",
        "contacted",
        "confirmed",
        "in_production",
        "delivered",
        "cancelled",
      ],
    },
  },
} as const
