import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { CompanyDetailPanel, type CompanyRow } from "@/components/CompanyDetailPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProfile } from "@/hooks/useProfile";
import { useT, type MessageKey } from "@/lib/i18n";

/** A hero fotó a `public/` mappából jön, így nem megy át a bundleren. */
const HERO_IMAGE_URL = "/hero-crm.jpg";

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({
    meta: [
      { title: "CRM — Real Estate Connect" },
      {
        name: "description",
        content: "Cégek és kapcsolattartók nyilvántartása a magyar ipari ingatlanpiacon.",
      },
      { property: "og:title", content: "CRM — Real Estate Connect" },
      {
        property: "og:description",
        content: "Cégek és kapcsolattartók nyilvántartása a magyar ipari ingatlanpiacon.",
      },
    ],
  }),
  component: CrmPage,
});

type BadgeKind = "reagalt" | "varakozik" | "nincs_valasz" | "lezarva";

const badgeStyles: Record<BadgeKind, { label: MessageKey; dot: string; pill: string }> = {
  reagalt: {
    label: "crm.status.reagalt",
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  varakozik: {
    label: "crm.status.varakozik",
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 border-amber-100",
  },
  nincs_valasz: {
    label: "crm.status.nincsValasz",
    dot: "bg-slate-400",
    pill: "bg-slate-50 text-slate-600 border-slate-200",
  },
  lezarva: {
    label: "crm.status.lezarva",
    dot: "bg-rose-500",
    pill: "bg-rose-50 text-rose-700 border-rose-100",
  },
};

const emptyForm = { name: "", domain: "", industry: "", city: "", notes: "" };

function CrmPage() {
  const { t, locale } = useT();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: companies, isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async (): Promise<CompanyRow[]> => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CompanyRow[];
    },
  });

  const { data: contacts } = useQuery({
    queryKey: ["crm-contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, company_id, name, email, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: activity } = useQuery({
    queryKey: ["crm-activity"],
    queryFn: async () => {
      const [emails, responses] = await Promise.all([
        supabase.from("emails_queue").select("id, company_id, status, created_at, sent_at"),
        supabase.from("responses").select("email_id, received_at"),
      ]);
      if (emails.error) throw emails.error;
      if (responses.error) throw responses.error;
      return { emails: emails.data, responses: responses.data };
    },
  });

  const createCompany = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error(t("crm.error.noProfile"));
      const { error } = await supabase.from("companies").insert({
        organization_id: profile.organization_id,
        name: form.name.trim(),
        domain: form.domain.trim() || null,
        industry: form.industry.trim() || null,
        city: form.city.trim() || null,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("crm.toast.created"));
      setForm(emptyForm);
      setOpenNew(false);
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const meta = useMemo(() => {
    const byCompany = new Map<
      string,
      {
        pending: number;
        lastActivity: string | null;
        contactName?: string;
        contactEmail?: string | undefined;
      }
    >();

    const ensure = (id: string) => {
      if (!byCompany.has(id)) byCompany.set(id, { pending: 0, lastActivity: null });
      return byCompany.get(id)!;
    };

    for (const contact of contacts ?? []) {
      if (!contact.company_id) continue;
      const entry = ensure(contact.company_id);
      if (!entry.contactName) {
        entry.contactName = contact.name;
        entry.contactEmail = contact.email ?? undefined;
      }
    }

    const emailCompany = new Map<string, string>();
    for (const email of activity?.emails ?? []) {
      if (!email.company_id) continue;
      emailCompany.set(email.id, email.company_id);
      const entry = ensure(email.company_id);
      if (email.status === "varakozik" || email.status === "jovahagyva") entry.pending += 1;
      const stamp = email.sent_at ?? email.created_at;
      if (stamp && (!entry.lastActivity || stamp > entry.lastActivity)) entry.lastActivity = stamp;
    }

    for (const response of activity?.responses ?? []) {
      const companyId = response.email_id ? emailCompany.get(response.email_id) : undefined;
      if (!companyId) continue;
      const entry = ensure(companyId);
      if (response.received_at && (!entry.lastActivity || response.received_at > entry.lastActivity))
        entry.lastActivity = response.received_at;
    }

    return byCompany;
  }, [contacts, activity]);

  const industries = useMemo(
    () =>
      Array.from(
        new Set((companies ?? []).map((c) => c.industry).filter((v): v is string => Boolean(v))),
      ).sort((a, b) => a.localeCompare(b, "hu")),
    [companies],
  );

  const filtered = (companies ?? []).filter((company) => {
    const term = search.trim().toLowerCase();
    const matchesTerm =
      !term ||
      company.name.toLowerCase().includes(term) ||
      (company.domain ?? "").toLowerCase().includes(term);
    const matchesStatus = statusFilter === "all" || company.status === statusFilter;
    const matchesIndustry = industryFilter === "all" || company.industry === industryFilter;
    return matchesTerm && matchesStatus && matchesIndustry;
  });

  const selected = (companies ?? []).find((company) => company.id === selectedId) ?? null;

  return (
    <div className="page-enter relative isolate">
      {/*
        Teljes oldalas háttérfotó, ugyanaz a felépítés, mint a Projekteknél:
        fotó -> filmszemcse -> oldalirányú sötétítés -> lefelé olvadó fátyol.
        Az oldalirányú sötétítés csak a BAL oldalt fogja, ahol a cím van, így
        a jobb oldali naplemente megmarad, a fehér szöveg mégis olvasható.
        A fátyol megállói pixelben vannak és a réteg magassága fix, ezért a
        fotó mindig ugyanott olvad át — kevés és sok cég esetén is.
      */}
        {/*
          A lekerekítést `clip-path` végzi, nem `overflow: hidden`.
          Ok: a Safari (WebKit) az animált, saját rétegre kerülő gyereket nem
          vágja a szülő lekerekített szélével — a mozgás alatt szögletes marad,
          és csak az animáció végén kerekedik le. A `clip-path` a kompozitált
          gyerekekre is érvényes, ezért a sarok az első képkockától kerek.
        */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[44rem] rounded-[1.625rem]"
        style={{ clipPath: "inset(0 round 1.625rem)" }}
      >
        {/* Fordított mozgás: benagyítva indul és 14 másodperc alatt
            távolodik, így a végén a teljes raktár és a naplemente látszik. */}
        <div
          className="rec-ken-burns-out absolute inset-0 bg-primary bg-cover bg-center"
          style={{ backgroundImage: `url('${HERO_IMAGE_URL}')` }}
        />
        <div className="grain-overlay absolute inset-0" />
        {/* Oldalirányú sötétítés csak a cím alatt, hogy a raktár és a
            naplemente a jobb oldalon szabadon látszódjon. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(100deg, oklch(0.14 0.03 250 / 58%) 0%, oklch(0.16 0.03 245 / 22%) 42%, transparent 62%)",
          }}
        />
        {/* Lélegző naplemente-fény a nap körül. */}
        <div
          className="rec-sun-breathe absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(24rem 17rem at 85% 23%, oklch(0.88 0.17 64 / 60%), oklch(0.8 0.15 50 / 24%) 45%, transparent 72%)",
            mixBlendMode: "screen",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(180deg, oklch(0.18 0.03 240 / 16%) 0px, oklch(0.2 0.03 235 / 20%) 150px, oklch(0.2 0.03 235 / 36%) 240px, oklch(0.24 0.04 230 / 40%) 430px, oklch(0.98 0.006 84.6 / 72%) 490px, oklch(0.98 0.006 84.6) 580px)",
          }}
        />
      </div>

      <div className="flex flex-col justify-end gap-6 px-1 pb-2 pt-28 sm:flex-row sm:items-end sm:justify-between sm:px-4 sm:pt-56">
        <div>
          <p
            className="rec-fade-up micro-label flex items-center gap-2.5 text-white/80"
            style={{ animationDelay: "80ms" }}
          >
            <span aria-hidden className="size-[5px] rounded-full bg-gold" />
            {t("crm.kicker")}
          </p>
          <h1 className="mt-3 text-[clamp(1.75rem,3.6vw,2.75rem)] font-semibold leading-[1.1] tracking-[-0.03em]">
            <span className="rec-mask-line">
              <span className="gold-shimmer">CRM</span>
            </span>
          </h1>
          <hr aria-hidden className="gold-rule mt-5" />
          <p
            className="rec-fade-up mt-4 max-w-xl text-sm leading-relaxed text-white/90"
            style={{ animationDelay: "480ms" }}
          >
            {t("crm.description")}
          </p>
        </div>

        <Button
          onClick={() => setOpenNew(true)}
          className="rec-fade-up min-h-11 shrink-0 bg-white text-foreground shadow-md hover:bg-white/90"
          style={{ animationDelay: "560ms" }}
        >
          <Plus className="mr-1.5 size-4" /> {t("crm.newCompany")}
        </Button>
      </div>

      <div className="lux-panel mb-6 mt-10 flex flex-col gap-3 p-4 shadow-[var(--shadow-lux)] sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("crm.searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder={t("crm.filter.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("crm.filter.allStatus")}</SelectItem>
            <SelectItem value="nincs_valasz">{t("crm.status.nincsValasz")}</SelectItem>
            <SelectItem value="valaszolt">{t("crm.status.valaszolt")}</SelectItem>
            <SelectItem value="erdeklodik">{t("crm.status.erdeklodik")}</SelectItem>
            <SelectItem value="lezarva">{t("crm.status.lezarva")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={industryFilter} onValueChange={setIndustryFilter}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder={t("crm.filter.industry")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("crm.filter.allIndustry")}</SelectItem>
            {industries.map((industry) => (
              <SelectItem key={industry} value={industry}>
                {industry}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-surface px-6 py-16 text-center">
          <Building2 className="mx-auto mb-3 size-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            {companies && companies.length > 0
              ? t("crm.empty.filtered")
              : t("crm.empty.none")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("crm.empty.hint")}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((company) => {
            const info = meta.get(company.id);
            const kind = badgeKind(company.status, info?.pending ?? 0);
            const badge = badgeStyles[kind];
            return (
              <li key={company.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(company.id)}
                  className="card-surface w-full px-5 py-4 text-left transition-colors hover:border-primary/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {company.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[company.industry, company.city, company.domain]
                          .filter(Boolean)
                          .join(" · ") || t("crm.noIndustryCity")}
                      </p>
                      <p className="mt-2 truncate text-xs text-muted-foreground">
                        {info?.contactName
                          ? `${info.contactName}${info.contactEmail ? ` — ${info.contactEmail}` : ""}`
                          : t("crm.noContact")}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${badge.pill}`}
                      >
                        <span className={`size-1.5 rounded-full ${badge.dot}`} />
                        {t(badge.label)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {info?.lastActivity
                          ? t("crm.lastActivity", { date: formatDate(info.lastActivity, locale) })
                          : t("crm.noActivity")}
                      </span>
                      {company.opt_out && (
                        <span className="text-xs font-medium text-rose-600">{t("crm.optedOut")}</span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("crm.newCompany")}</DialogTitle>
            <DialogDescription>{t("crm.dialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="n-name">{t("crm.field.name")}</Label>
              <Input
                id="n-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-domain">Domain</Label>
              <Input
                id="n-domain"
                placeholder="pelda.hu"
                value={form.domain}
                onChange={(event) => setForm({ ...form, domain: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-industry">{t("crm.filter.industry")}</Label>
              <Input
                id="n-industry"
                value={form.industry}
                onChange={(event) => setForm({ ...form, industry: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-city">{t("crm.field.city")}</Label>
              <Input
                id="n-city"
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="n-notes">{t("crm.field.notes")}</Label>
              <Textarea
                id="n-notes"
                rows={3}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenNew(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => createCompany.mutate()}
              disabled={!form.name.trim() || createCompany.isPending}
            >
              {t("crm.saveCompany")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CompanyDetailPanel company={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function badgeKind(status: CompanyRow["status"], pending: number): BadgeKind {
  if (status === "lezarva") return "lezarva";
  if (status === "valaszolt" || status === "erdeklodik") return "reagalt";
  return pending > 0 ? "varakozik" : "nincs_valasz";
}

function formatDate(value: string, locale: string) {
  return new Date(value).toLocaleDateString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
