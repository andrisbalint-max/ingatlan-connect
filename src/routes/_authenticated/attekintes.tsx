import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, FolderKanban, Inbox, Send, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/attekintes")({
  head: () => ({
    meta: [
      { title: "Áttekintés — Ipari Ingatlan Platform" },
      { name: "description", content: "Napi áttekintés: jóváhagyásra váró emailek, válaszok és aktív projektek." },
      { property: "og:title", content: "Áttekintés — Ipari Ingatlan Platform" },
      {
        property: "og:description",
        content: "Napi áttekintés: jóváhagyásra váró emailek, válaszok és aktív projektek.",
      },
    ],
  }),
  component: Dashboard,
});

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const today = startOfToday();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const [pending, sentToday, responsesYesterday, activeProjects] = await Promise.all([
        supabase.from("emails_queue").select("id", { count: "exact", head: true }).eq("status", "varakozik"),
        supabase
          .from("emails_queue")
          .select("id", { count: "exact", head: true })
          .eq("status", "elkuldot")
          .gte("sent_at", today.toISOString()),
        supabase
          .from("responses")
          .select("id", { count: "exact", head: true })
          .gte("received_at", yesterday.toISOString())
          .lt("received_at", today.toISOString()),
        supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "aktiv"),
      ]);

      return {
        pending: pending.count ?? 0,
        sentToday: sentToday.count ?? 0,
        responsesYesterday: responsesYesterday.count ?? 0,
        activeProjects: activeProjects.count ?? 0,
      };
    },
  });

  const cards = [
    { label: "Email vár jóváhagyásra", value: data?.pending, icon: Inbox },
    { label: "Ma elküldve", value: data?.sentToday, icon: Send },
    { label: "Válaszok tegnap", value: data?.responsesYesterday, icon: Clock },
    { label: "Aktív projektek", value: data?.activeProjects, icon: FolderKanban },
  ];

  return (
    <div>
      <PageHeader title="Áttekintés" description="A mai nap legfontosabb mutatói." />

      <AiBudgetBanners />



      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="card-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <card.icon className="size-4" strokeWidth={1.5} />
              </span>
            </div>
            {isLoading ? (
              <Skeleton className="mt-3 h-9 w-12" />
            ) : (
              <p className="mt-3 text-3xl font-semibold tabular-nums text-foreground">{card.value ?? 0}</p>
            )}
          </div>
        ))}
      </div>

      <NewResponses />

      <section className="card-surface mt-6 p-6">
        <h2 className="text-base font-semibold text-foreground">Legutóbbi események</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Itt fognak megjelenni a legutóbbi email- és válaszesemények.
        </p>
        <div className="mt-6 rounded-lg border border-dashed border-input px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">Még nincs megjeleníthető aktivitás.</p>
        </div>
      </section>
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  erdeklodes: "Érdeklődés",
  talalkozo: "Találkozó",
  elutasitas: "Elutasítás",
  kerdes: "Kérdés",
  autovalasz: "Automatikus válasz",
};

function NewResponses() {
  const queryClient = useQueryClient();

  const { data: items } = useQuery({
    queryKey: ["unseen-responses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("responses")
        .select("id, received_at, category, raw_text, emails_queue(company_id, companies(name))")
        .eq("seen", false)
        .order("received_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        received_at: string;
        category: string | null;
        raw_text: string | null;
        emails_queue: { companies: { name: string } | null } | null;
      }>;
    },
  });

  const markSeen = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("responses").update({ seen: true }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unseen-responses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  if (!items || items.length === 0) return null;

  return (
    <section className="card-surface mt-6 border-primary/30 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Sparkles className="size-4 text-primary" strokeWidth={1.5} />
          Új válaszok ({items.length})
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => markSeen.mutate(items.map((i) => i.id))}
          disabled={markSeen.isPending}
        >
          Mindet olvasottnak jelölöm
        </Button>
      </div>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-input bg-background p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {item.emails_queue?.companies?.name ?? "Ismeretlen cég"}
              </span>
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                {item.category ? (CATEGORY_LABELS[item.category] ?? item.category) : "Feldolgozás alatt"}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(item.received_at).toLocaleString("hu-HU")}
              </span>
            </div>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
              {item.raw_text ?? "—"}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
