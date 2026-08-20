export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      events: {
        Row: {
          id: string;
          symbol: string;
          filter_passed: boolean;
          is_read: boolean;
          updated_at: string;
          [key: string]: unknown;
        };
        Insert: Record<string, unknown>;
        Update: {
          is_read?: boolean;
          updated_at?: string;
          [key: string]: unknown;
        };
        Relationships: [];
      };
      portfolio: {
        Row: Record<string, unknown>;
        Insert: {
          symbol: string;
          name: string;
          weight_pct: number;
          alert_threshold: number;
          alerts_per_week_est?: number | null;
          is_active?: boolean;
          sort_order?: number;
          position_side?: string;
          sentiment_spark?: unknown[];
        };
        Update: {
          alert_threshold?: number;
          is_active?: boolean;
          alerts_per_week_est?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      feedback: {
        Row: Record<string, unknown>;
        Insert: {
          event_id: string;
          verdict: string;
          source_weights_adjusted?: boolean;
        };
        Update: Record<string, unknown>;
        Relationships: [];
      };
      source_registry: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
