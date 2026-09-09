import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  FolderKanban,
  Inbox,
  Send,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";

import { getAiBudgetStatus } from "@/lib/ai-budget.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RecLogo } from "@/components/RecLogo";
import { useProfile } from "@/hooks/useProfile";
import { useT, type MessageKey } from "@/lib/i18n";

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

function greetingKey(hour: number): MessageKey {
  if (hour < 10) return "overview.greetingMorning";
  if (hour < 18) return "overview.greetingDay";
  return "overview.greetingEvening";
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * Nagy számok felfutása 0-ról a valós értékre.
 *
 * Csak akkor indul, ha az adat már megjött (`ready`), és azonnal a végértéket
 * adja, ha a felhasználó csökkentett animációt kért.
 */
function useCountUp(target: number, ready: boolean) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!ready) return;
    if (target <= 0 || prefersReducedMotion()) {
      setValue(target);
      return;
    }

    const duration = 900;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target, ready]);

  return value;
}

function Dashboard() {
  const { t, locale } = useT();
  const { data: profile } = useProfile();
  const now = new Date();
  // Ha nincs kitöltött név a profilban, a köszöntés név nélkül áll meg —
  // az emailből "kitalált" keresztnév magyarul könnyen hibás lenne.
  const who = profile?.name?.trim() || null;

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const today = startOfToday();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const [pending, sentToday, responsesYesterday, activeProjects] = await Promise.all([
        supabase
          .from("emails_queue")
          .select("id", { count: "exact", head: true })
          .eq("status", "varakozik"),
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

  const cards: Array<{ label: MessageKey; value: number; icon: LucideIcon }> = [
    { label: "overview.kpi.pending", value: data?.pending ?? 0, icon: Inbox },
    { label: "overview.kpi.sentToday", value: data?.sentToday ?? 0, icon: Send },
    { label: "overview.kpi.responsesYesterday", value: data?.responsesYesterday ?? 0, icon: Clock },
    { label: "overview.kpi.activeProjects", value: data?.activeProjects ?? 0, icon: FolderKanban },
  ];

  const quickLinks: Array<{ to: string; label: MessageKey; description: MessageKey }> = [
    { to: "/talalt-cegek", label: "nav.talaltCegek", description: "overview.quick.foundDesc" },
    { to: "/riportok", label: "nav.riportok", description: "overview.quick.reportsDesc" },
    { to: "/email-sor", label: "nav.emailSor", description: "overview.quick.emailQueueDesc" },
  ];

  return (
    <div className="page-enter">
      {/* --- Hero: ipari csarnok fotó, filmszemcsével és lassú Ken Burns nagyítással --- */}
      <section
        className="relative overflow-hidden rounded-[1.625rem] shadow-[var(--shadow-hero)]"
        style={{ minHeight: "clamp(23rem, 42vw, 29.5rem)" }}
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
              "linear-gradient(96deg, oklch(0.2 0.03 218 / 95%) 0%, oklch(0.26 0.04 220 / 82%) 42%, oklch(0.4 0.055 210 / 44%) 100%)",
          }}
        />
        <div aria-hidden className="grain-overlay absolute inset-0" />
        <div aria-hidden className="hero-vignette absolute inset-0" />

        {/* Embléma vízjelként, saját sötét udvarral a kontraszt miatt. */}
        <div
          aria-hidden
          className="absolute right-6 top-6 flex size-[4.75rem] items-center justify-center rounded-full sm:right-10 sm:top-9"
          style={{
            backgroundImage:
              "radial-gradient(circle, oklch(0.18 0.03 220 / 62%) 40%, transparent 72%)",
          }}
        >
          <RecLogo size={50} className="size-[3.125rem]" title="" />
        </div>

        <div className="relative flex h-full flex-col justify-end p-6 pb-28 sm:p-12 sm:pb-32">
          <p
            className="rec-fade-up micro-label flex items-center gap-2.5 text-white/75"
            style={{ animationDelay: "80ms" }}
          >
            <span aria-hidden className="size-[5px] rounded-full bg-gold" />
            {now.toLocaleDateString(locale, {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </p>

          <p
            className="rec-fade-up mt-4 text-lg font-normal text-white/80 sm:text-[22px]"
            style={{ animationDelay: "200ms" }}
          >
            {who ? `${t(greetingKey(now.getHours()))}, ${who}.` : `${t(greetingKey(now.getHours()))}!`}
          </p>

          <h1 className="mt-1 font-display text-[clamp(2.4rem,5.6vw,4.25rem)] font-medium leading-[1.05] tracking-[-0.015em]">
            <span className="rec-mask-line">
              <span className="gold-shimmer italic">{t("overview.display")}</span>
            </span>
          </h1>

          <hr aria-hidden className="gold-rule mt-6" />

          <p
            className="rec-fade-up mt-4 max-w-xl text-sm leading-relaxed text-white/85 sm:text-[15px]"
            style={{ animationDelay: "560ms" }}
          >
            {t("overview.intro")}
          </p>
        </div>
      </section>

      {/* --- KPI kártyák: a hero alsó szélére felhúzva, tömör háttérrel --- */}
      <div className="relative z-10 -mt-16 grid gap-5 px-1.5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => (
          <KpiCard
            key={card.label}
            label={t(card.label)}
            value={card.value}
            icon={card.icon}
            loading={isLoading}
            delayMs={420 + index * 90}
          />
        ))}
      </div>

      <div className="mt-6">
        <AiBudgetBanners />
      </div>

      <NewResponses />

      {/* --- Alsó két panel: aktivitás + gyors elérés --- */}
      <div className="mt-9 grid items-start gap-6 lg:grid-cols-[1.9fr_1fr]">
        <section
          className="lux-panel rec-fade-up p-7 sm:px-8"
          style={{ animationDelay: "760ms" }}
        >
          <p className="micro-label text-gold-deep">{t("overview.activity.kicker")}</p>
          <h2 className="mt-2 font-display text-[27px] font-medium tracking-[-0.01em] text-foreground">
            {t("overview.activity.title")}
          </h2>
          <hr aria-hidden className="gold-hairline mb-6 mt-5" />
          <div className="px-2 pb-6 pt-8 text-center">
            <p aria-hidden className="text-[13px] tracking-[0.5em] text-gold">
              ◆ ◆ ◆
            </p>
            <p className="mt-3.5 font-display text-[19px] italic text-muted-foreground">
              {t("overview.activity.empty")}
            </p>
          </div>
        </section>

        <section className="lux-panel rec-fade-up p-7 sm:px-8" style={{ animationDelay: "860ms" }}>
          <p className="micro-label text-gold-deep">{t("overview.quick.kicker")}</p>
          <h2 className="mt-2 font-display text-[27px] font-medium tracking-[-0.01em] text-foreground">
            {t("overview.quick.title")}
          </h2>
          <hr aria-hidden className="gold-hairline mb-2 mt-5" />
          <ul className="flex flex-col">
            {quickLinks.map((link, index) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className={`group flex min-h-11 items-center justify-between gap-4 py-4 transition-colors hover:text-primary ${
                    index < quickLinks.length - 1 ? "border-b border-line-warm" : ""
                  }`}
                >
                  <span>
                    <span className="block text-[14.5px] font-medium">{t(link.label)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t(link.description)}
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="size-4 shrink-0 text-gold-deep transition-transform group-hover:translate-x-1"
                    strokeWidth={1.5}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="mt-14 border-t border-line-warm pt-5">
        <div className="micro-label flex flex-wrap justify-between gap-2 text-muted-foreground">
          <span>Real Estate Connect</span>
          <span>108 REAL ESTATE</span>
        </div>
      </footer>
    </div>
  );
}

/** Egy statisztikai kártya: arany felső él, ritkított felirat, felfutó szám. */
function KpiCard({
  label,
  value,
  icon: Icon,
  loading,
  delayMs,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  loading: boolean;
  delayMs: number;
}) {
  const shown = useCountUp(value, !loading);

  return (
    <div
      className="lux-card card-lift rec-fade-up px-6 pb-6 pt-6"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span aria-hidden className="gold-edge" />
      <p className="micro-label max-w-[calc(100%-3rem)] text-muted-foreground">{label}</p>
      <span
        aria-hidden
        className="absolute right-5 top-5 flex size-9 items-center justify-center rounded-full border border-gold/45 text-gold-deep"
      >
        <Icon className="size-[17px]" strokeWidth={1.5} />
      </span>
      {loading ? (
        <Skeleton className="mt-4 h-11 w-16" />
      ) : (
        <p className="mt-4 text-[44px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-foreground">
          {shown}
        </p>
      )}
      <span aria-hidden className="mt-3.5 block h-[1.5px] w-[30px] bg-gold/85" />
    </div>
  );
}

const CATEGORY_KEYS: Record<string, MessageKey> = {
  erdeklodes: "category.erdeklodes",
  talalkozo: "category.talalkozo",
  elutasitas: "category.elutasitas",
  kerdes: "category.kerdes",
  autovalasz: "category.autovalasz",
};

function NewResponses() {
  const queryClient = useQueryClient();
  const { t, locale } = useT();

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
    <section className="lux-panel mt-6 p-6 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-[23px] font-medium text-foreground">
          <Sparkles className="size-4 text-gold-deep" strokeWidth={1.5} />
          {t("overview.responses.title")} ({items.length})
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => markSeen.mutate(items.map((i) => i.id))}
          disabled={markSeen.isPending}
        >
          {t("overview.responses.markAll")}
        </Button>
      </div>
      <hr aria-hidden className="gold-hairline mb-5 mt-4" />
      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="card-lift rounded-xl border border-line-warm bg-background p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {item.emails_queue?.companies?.name ?? t("overview.responses.unknownCompany")}
              </span>
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                {item.category
                  ? CATEGORY_KEYS[item.category]
                    ? t(CATEGORY_KEYS[item.category]!)
                    : item.category
                  : t("overview.responses.processing")}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(item.received_at).toLocaleString(locale)}
              </span>
            </div>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
              {item.raw_text ?? t("common.dash")}
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
  const { t } = useT();
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
            {t("ai.outOfCredit", {
              provider: AI_PROVIDER_LABELS[status.provider ?? ""] ?? "AI",
            })}
          </p>
        </div>
      )}

      {status.budgetWarning && !budgetDismissed && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" strokeWidth={1.5} />
          <p className="flex-1 text-sm text-amber-900">{t("ai.budgetWarning")}</p>
          <button
            type="button"
            aria-label={t("common.close")}
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
