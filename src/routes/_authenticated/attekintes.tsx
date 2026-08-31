import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, FolderKanban, Inbox, Send } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
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
