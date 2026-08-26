import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useProfile, type AppRole, type Profile } from "@/hooks/useProfile";
import { PageHeader } from "@/components/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/felhasznalok")({
  head: () => ({
    meta: [
      { title: "Felhasználók — Ipari Ingatlan Platform" },
      { name: "description", content: "Szervezeti felhasználók és jogosultságok kezelése." },
      { property: "og:title", content: "Felhasználók — Ipari Ingatlan Platform" },
      { property: "og:description", content: "Szervezeti felhasználók és jogosultságok kezelése." },
    ],
  }),
  component: UsersPage,
});

const roleLabels: Record<AppRole, string> = {
  admin: "Adminisztrátor",
  user: "Felhasználó",
  viewer: "Megtekintő",
};

function UsersPage() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ["profiles"],
    enabled: profile?.role === "admin",
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Profile[];
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: AppRole }) => {
      const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Jogosultság frissítve.");
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: () => toast.error("A jogosultság frissítése nem sikerült."),
  });

  if (profileLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (profile?.role !== "admin") {
    return (
      <div>
        <PageHeader title="Felhasználók" />
        <div className="card-surface p-6">
          <p className="text-sm text-muted-foreground">
            Ehhez az oldalhoz csak adminisztrátorok férhetnek hozzá.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Felhasználók" description="A szervezet tagjai és jogosultságaik." />

      <div className="card-surface overflow-hidden">
        <div className="hidden grid-cols-[2fr_1.5fr_1fr] gap-4 border-b border-border px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
          <span>Név</span>
          <span>Email</span>
          <span>Jogosultság</span>
        </div>

        {isLoading && (
          <div className="space-y-3 p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!isLoading && users?.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">Még nincs felhasználó.</p>
        )}

        {users?.map((user) => (
          <div
            key={user.id}
            className="grid gap-3 border-b border-border px-6 py-4 last:border-b-0 sm:grid-cols-[2fr_1.5fr_1fr] sm:items-center sm:gap-4"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{user.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground sm:hidden">{user.email}</p>
            </div>
            <p className="hidden text-sm text-muted-foreground sm:block">{user.email}</p>
            <Select
              value={user.role}
              onValueChange={(role) => updateRole.mutate({ id: user.id, role: role as AppRole })}
            >
              <SelectTrigger className="w-full sm:w-[180px]" aria-label={`${user.email} jogosultsága`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(roleLabels) as AppRole[]).map((role) => (
                  <SelectItem key={role} value={role}>
                    {roleLabels[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}
