import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, FolderKanban, Inbox, Send, Sparkles, X } from "lucide-react";
import { getAiBudgetStatus } from "@/lib/ai-budget.functions";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/attekintes")({
  head: () => ({
    meta: [
      { title: "Áttekintés — Real Estate Connect" },
      {
        name: "description",
        content: "Napi áttekintés: jóváhagyásra váró emailek, válaszok és aktív projektek.",
      },
      { property: "og:title", content: "Áttekintés — Real Estate Connect" },
      {
        property: "og:description",
        content: "Napi áttekintés: jóváhagyásra váró emailek, válaszok és aktív projektek.",
      },
    ],
  }),
  component: Dashboard,
});

/** A hero fotó a `public/` mappából jön, így nem megy át a bundleren. */
const HERO_IMAGE_URL = "/hero-warehouse.jpg";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function greeting(hour: number) {
  if (hour < 10) return "Jó reggelt";
  if (hour < 18) return "Jó napot";
  return "Jó estét";
}

function Dashboard() {
  const now = new Date();

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
      {/* --- Hero: ipari csarnok fotó, lassú Ken Burns nagyítással --- */}
      <section
        className="relative overflow-hidden rounded-2xl shadow-[var(--shadow-hero)]"
        style={{ minHeight: "clamp(15rem, 34vw, 22rem)" }}
      >
        <div
          aria-hidden
          className="rec-ken-burns absolute inset-0 bg-primary bg-cover bg-center"
          style={{ backgroundImage: `url('${HERO_IMAGE_URL}')` }}
        />
        {/* Sötétítő gradiens — enélkül a fehér szöveg nem lenne olvasható a fotón. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(100deg, oklch(0.26 0.05 215 / 94%) 0%, oklch(0.3 0.05 210 / 78%) 45%, oklch(0.42 0.07 200 / 42%) 100%)",
          }}
        />

        <div className="relative flex h-full flex-col justify-end gap-4 p-6 pb-20 sm:p-9 sm:pb-24">
          <span
            className="rec-fade-up glass-panel inline-flex w-fit items-center gap-2 px-3 py-1.5 text-xs font-medium text-white"
            style={{ animationDelay: "80ms" }}
          >
            <span aria-hidden className="size-1.5 rounded-full bg-white" />
            {now.toLocaleDateString("hu-HU", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </span>

          <div>
            <p
              className="rec-fade-up text-sm font-medium text-white/80"
              style={{ animationDelay: "160ms" }}
            >
              {greeting(now.getHours())}
            </p>
            <h1
              className="rec-fade-up mt-1 text-3xl font-semibold tracking-tight text-white sm:text-[40px] sm:leading-[1.1]"
              style={{ animationDelay: "240ms" }}
            >
              Real Estate <span className="font-bold">Connect</span>
            </h1>
            <p
              className="rec-fade-up mt-2 max-w-xl text-sm leading-relaxed text-white/85 sm:text-base"
              style={{ animationDelay: "320ms" }}
            >
              Ipari ingatlanpiaci kereskedelmi platform — a mai nap legfontosabb mutatói egy
              helyen.
            </p>
          </div>
        </div>
      </section>

      {/* --- KPI kártyák: a hero alsó szélére felhúzva, tömör háttérrel a jó olvashatóság miatt --- */}
      <div className="relative z-10 -mt-14 grid gap-4 px-1 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => (
          <div
            key={card.label}
            className="card-surface card-lift rec-fade-up p-5"
            style={{ animationDelay: `${360 + index * 90}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <card.icon className="size-4" strokeWidth={1.5} />
              </span>
            </div>
            {isLoading ? (
              <Skeleton className="mt-3 h-9 w-12" />
            ) : (
              <p className="mt-3 text-3xl font-semibold tabular-nums text-foreground">
                {card.value ?? 0}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6">
        <AiBudgetBanners />
      </div>

      <NewResponses />

      <section className="card-surface mt-6 p-6">
        <h2 className="text-base font-semibold text-foreground">Legutóbbi események</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Itt fognak megjelenni a legutóbbi email- és válaszesemények.
        </p>
        <div className="mt-6 rounded-xl border border-dashed border-input bg-secondary/30 px-6 py-12 text-center">
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
          <li key={item.id} className="card-lift rounded-xl border border-input bg-background p-4">
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

const AI_PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Claude",
  openai: "OpenAI",
};

/** AI credit / budget banners (fed by the ai-budget-monitor cron + AI helper). */
function AiBudgetBanners() {
  const [budgetDismissed, setBudgetDismissed] = useState(false);
  const { data: status } = useQuery({
    queryKey: ["ai-budget-status"],
    queryFn: () => getAiBudgetStatus(),
    staleTime: 60_000,
  });

  if (!status) return null;

  return (
    <div className="space-y-3">
      {status.outOfCredit && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" strokeWidth={1.5} />
          <p className="text-sm font-medium text-destructive">
            Elfogyott a(z) {AI_PROVIDER_LABELS[status.provider ?? ""] ?? "AI"} AI-kredit — az
            automatikus follow-up/riport/projekt-funkciók szünetelnek, amíg fel nem töltöd.
          </p>
        </div>
      )}

      {status.budgetWarning && !budgetDismissed && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" strokeWidth={1.5} />
          <p className="flex-1 text-sm text-amber-900">
            Az AI-használat becsült költsége elérte a havi keret 80%-át — töltsd fel időben az
            OpenAI/Anthropic egyenleget, hogy ne álljon meg az automatizmus.
          </p>
          <button
            type="button"
            aria-label="Bezárás"
            onClick={() => setBudgetDismissed(true)}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-900"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
