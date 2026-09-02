// NOTE (R4-ORDERS-PLUS, 2026-09-01): patched BY HAND, additively, for migration
// 0036 — `order_events`, `orders.city` and create_order's `p_city`. 0036 is
// applied on STAGING; `npm run db:types` reads the LINKED project, which is
// PROD (supabase/.temp/project-ref), so regenerating before the prod push would
// silently delete these three additions. Regenerate after `make db-push-prod`.
//
// NOTE (R4-PDF-CLIENTE, 2026-09-02): same treatment for migration 0038 — the
// six `settings.seller_*` columns. 0038 is applied on NEITHER database yet (the
// PM pushes it, staging then prod), so regenerating now would not produce them
// either. Same rule: regenerate only after the prod push.
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
      design_images: {
        Row: {
          design_id: string
          id: string
          image: string
          sort_order: number
        }
        Insert: {
          design_id: string
          id?: string
          image: string
          sort_order?: number
        }
        Update: {
          design_id?: string
          id?: string
          image?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "design_images_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
        ]
      }
      design_products: {
        Row: {
          design_id: string
          product_id: string
        }
        Insert: {
          design_id: string
          product_id: string
        }
        Update: {
          design_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_products_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      designs: {
        Row: {
          accepts_custom_notes: boolean
          accepts_custom_text: boolean
          active: boolean
          code: string | null
          description_en: string | null
          description_no: string | null
          description_step2_en: string | null
          description_step2_no: string | null
          id: string
          name: string
          name_en: string
          name_no: string
          preview_image: string | null
          slug: string
          sort_order: number
          supplier_id: string
        }
        Insert: {
          accepts_custom_notes?: boolean
          accepts_custom_text?: boolean
          active?: boolean
          code?: string | null
          description_en?: string | null
          description_no?: string | null
          description_step2_en?: string | null
          description_step2_no?: string | null
          id?: string
          name: string
          name_en?: string
          name_no?: string
          preview_image?: string | null
          slug: string
          sort_order?: number
          supplier_id: string
        }
        Update: {
          accepts_custom_notes?: boolean
          accepts_custom_text?: boolean
          active?: boolean
          code?: string | null
          description_en?: string | null
          description_no?: string | null
          description_step2_en?: string | null
          description_step2_no?: string | null
          id?: string
          name?: string
          name_en?: string
          name_no?: string
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
      discount_products: {
        Row: {
          product_id: string
        }
        Insert: {
          product_id: string
        }
        Update: {
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_rule_products: {
        Row: {
          product_id: string
          rule_id: string
        }
        Insert: {
          product_id: string
          rule_id: string
        }
        Update: {
          product_id?: string
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_rule_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_rule_products_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "discount_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_rules: {
        Row: {
          discount_mode: string
          discount_pct: number | null
          enabled: boolean
          id: string
          name: string
          sort_order: number
          suggested_product_id: string
          suggested_qty: number
          trigger_min_qty: number
        }
        Insert: {
          discount_mode?: string
          discount_pct?: number | null
          enabled?: boolean
          id?: string
          name: string
          sort_order?: number
          suggested_product_id: string
          suggested_qty?: number
          trigger_min_qty?: number
        }
        Update: {
          discount_mode?: string
          discount_pct?: number | null
          enabled?: boolean
          id?: string
          name?: string
          sort_order?: number
          suggested_product_id?: string
          suggested_qty?: number
          trigger_min_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "discount_rules_suggested_product_id_fkey"
            columns: ["suggested_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_tiers: {
        Row: {
          id: string
          min_qty: number
          pct: number
          sort_order: number
        }
        Insert: {
          id?: string
          min_qty: number
          pct: number
          sort_order?: number
        }
        Update: {
          id?: string
          min_qty?: number
          pct?: number
          sort_order?: number
        }
        Relationships: []
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
          name: string | null
          sort_order: number
          supplier_color_id: string | null
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
          name?: string | null
          sort_order?: number
          supplier_color_id?: string | null
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
          name?: string | null
          sort_order?: number
          supplier_color_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "options_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "option_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "options_supplier_color_id_fkey"
            columns: ["supplier_color_id"]
            isOneToOne: false
            referencedRelation: "supplier_colors"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          meta: Json
          order_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          meta?: Json
          order_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          meta?: Json
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          config_code: string | null
          config_snapshot: Json | null
          currency_snapshot: string
          discount_cents: number
          discount_pct: number | null
          discount_source: string | null
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
          discount_cents?: number
          discount_pct?: number | null
          discount_source?: string | null
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
          discount_cents?: number
          discount_pct?: number | null
          discount_source?: string | null
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
          city: string | null
          code: string
          country: string | null
          created_at: string
          customer_name: string
          discount_ratified_at: string | null
          email: string
          id: string
          internal_notes: string | null
          locale: string
          message: string | null
          paid_at: string | null
          phone: string | null
          status: Database["public"]["Enums"]["order_status"]
          tracking_code: string | null
          updated_at: string
          zipcode: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          country?: string | null
          created_at?: string
          customer_name: string
          discount_ratified_at?: string | null
          email: string
          id?: string
          internal_notes?: string | null
          locale: string
          message?: string | null
          paid_at?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          tracking_code?: string | null
          updated_at?: string
          zipcode?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          country?: string | null
          created_at?: string
          customer_name?: string
          discount_ratified_at?: string | null
          email?: string
          id?: string
          internal_notes?: string | null
          locale?: string
          message?: string | null
          paid_at?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          tracking_code?: string | null
          updated_at?: string
          zipcode?: string | null
        }
        Relationships: []
      }
      product_attributes: {
        Row: {
          created_at: string
          id: string
          key: string
          label_en: string | null
          label_no: string | null
          product_id: string
          sort_order: number
          value: string | null
          value_num: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          key?: string
          label_en?: string | null
          label_no?: string | null
          product_id: string
          sort_order?: number
          value?: string | null
          value_num?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          label_en?: string | null
          label_no?: string | null
          product_id?: string
          sort_order?: number
          value?: string | null
          value_num?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_attributes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          id: string
          image: string
          product_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          image: string
          product_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          image?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
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
          series_en: string | null
          series_no: string | null
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
          series_en?: string | null
          series_no?: string | null
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
          series_en?: string | null
          series_no?: string | null
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
          automations_enabled: boolean
          color_accent: string
          color_dark: string
          color_light: string
          id: number
          quantity_discounts_enabled: boolean
          seller_address: string | null
          seller_email: string | null
          seller_name: string | null
          seller_org_number: string | null
          seller_phone: string | null
          seller_vat_registered: boolean
          updated_at: string
          vipps_link: string | null
          vipps_number: string | null
          vipps_qr_image: string | null
        }
        Insert: {
          automations_enabled?: boolean
          color_accent: string
          color_dark: string
          color_light: string
          id: number
          quantity_discounts_enabled?: boolean
          seller_address?: string | null
          seller_email?: string | null
          seller_name?: string | null
          seller_org_number?: string | null
          seller_phone?: string | null
          seller_vat_registered?: boolean
          updated_at?: string
          vipps_link?: string | null
          vipps_number?: string | null
          vipps_qr_image?: string | null
        }
        Update: {
          automations_enabled?: boolean
          color_accent?: string
          color_dark?: string
          color_light?: string
          id?: number
          quantity_discounts_enabled?: boolean
          seller_address?: string | null
          seller_email?: string | null
          seller_name?: string | null
          seller_org_number?: string | null
          seller_phone?: string | null
          seller_vat_registered?: boolean
          updated_at?: string
          vipps_link?: string | null
          vipps_number?: string | null
          vipps_qr_image?: string | null
        }
        Relationships: []
      }
      supplier_colors: {
        Row: {
          active: boolean
          hex: string
          id: string
          name: string
          sort_order: number
          supplier_id: string
          swatch_image: string | null
        }
        Insert: {
          active?: boolean
          hex: string
          id?: string
          name: string
          sort_order?: number
          supplier_id: string
          swatch_image?: string | null
        }
        Update: {
          active?: boolean
          hex?: string
          id?: string
          name?: string
          sort_order?: number
          supplier_id?: string
          swatch_image?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_colors_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "public_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_colors_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
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
          p_city?: string
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
      db_size_bytes: { Args: never; Returns: number }
      reorder_designs: { Args: { p_ids: string[] }; Returns: undefined }
      reorder_products: {
        Args: { p_ids: string[]; p_supplier_id: string }
        Returns: undefined
      }
      replace_design_products: {
        Args: { p_design_id: string; p_product_ids: string[] }
        Returns: undefined
      }
      replace_discount_products: {
        Args: { p_product_ids: string[] }
        Returns: undefined
      }
      replace_discount_rule_products: {
        Args: { p_product_ids: string[]; p_rule_id: string }
        Returns: undefined
      }
      replace_discount_tiers: { Args: { p_rows: Json }; Returns: undefined }
      replace_product_attributes: {
        Args: { p_product_id: string; p_rows: Json }
        Returns: undefined
      }
      replace_supplier_colors: {
        Args: { p_rows: Json; p_supplier_id: string }
        Returns: undefined
      }
      storage_size_bytes: { Args: never; Returns: number }
    }
    Enums: {
      order_status:
        | "new"
        | "contacted"
        | "confirmed"
        | "in_production"
        | "shipped"
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
        "shipped",
        "delivered",
        "cancelled",
      ],
    },
  },
} as const

