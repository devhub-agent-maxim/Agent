import type { MultiDriverPlan } from '../routes/multi-driver';

/**
 * Supabase `routes` table row shape.
 * Mirrors the SQL schema:
 *
 *   CREATE TABLE routes (
 *     id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 *     plan_data       jsonb NOT NULL,
 *     total_stops     integer NOT NULL DEFAULT 0,
 *     total_drivers   integer NOT NULL DEFAULT 0,
 *     created_at      timestamptz NOT NULL DEFAULT now(),
 *     name            text
 *   );
 */
export interface RouteRow {
  id: string;
  user_id: string;
  plan_data: MultiDriverPlan;
  total_stops: number;
  total_drivers: number;
  created_at: string;
  name: string | null;
}

/** Payload used when inserting a new route row. */
export type RouteInsert = Omit<RouteRow, 'id' | 'created_at'>;

/** Shape returned when listing routes (plan_data omitted for performance). */
export type RouteListItem = Omit<RouteRow, 'plan_data'>;

export interface Database {
  public: {
    Tables: {
      routes: {
        Row: RouteRow;
        Insert: RouteInsert;
        Update: Partial<RouteInsert>;
      };
    };
  };
}
