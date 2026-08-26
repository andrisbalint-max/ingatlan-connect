import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "user" | "viewer";

export interface Profile {
  id: string;
  auth_user_id: string;
  organization_id: string;
  email: string;
  name: string | null;
  role: AppRole;
  created_at: string;
}

/**
 * Returns the current user's profile, creating it (plus the organization and
 * settings row for the very first user) on demand.
 */
export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    staleTime: 60_000,
    queryFn: async (): Promise<Profile | null> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase.rpc("ensure_profile");
      if (error) throw error;
      return (data ?? null) as Profile | null;
    },
  });
}
