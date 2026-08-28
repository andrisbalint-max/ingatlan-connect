import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
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

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({
    meta: [
      { title: "CRM — Ipari Ingatlan Platform" },
      {
        name: "description",
        content: "Cégek és kapcsolattartók nyilvántartása a magyar ipari ingatlanpiacon.",
      },
      { property: "og:title", content: "CRM — Ipari Ingatlan Platform" },
      {
        property: "og:description",
        content: "Cégek és kapcsolattartók nyilvántartása a magyar ipari ingatlanpiacon.",
      },
    ],
  }),
  component: CrmPage,
});

type BadgeKind = "reagalt" | "varakozik" | "nincs_valasz" | "lezarva";

const badgeStyles: Record<BadgeKind, { label: string; dot: string; pill: string }> = {
  reagalt: {
    label: "Reagált",
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  varakozik: {
    label: "Várakozik",
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 border-amber-100",
  },
  nincs_valasz: {
    label: "Nincs válasz",
    dot: "bg-slate-400",
    pill: "bg-slate-50 text-slate-600 border-slate-200",
  },
  lezarva: {
    label: "Lezárva",
    dot: "bg-rose-500",
    pill: "bg-rose-50 text-rose-700 border-rose-100",
  },
};

const emptyForm = { name: "", domain: "", industry: "", city: "", notes: "" };

function CrmPage() {
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
      if (!profile) throw new Error("Nincs betöltve a profil.");
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
      toast.success("Cég létrehozva.");
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
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="CRM" description="Cégek, kapcsolattartók és kontaktkeresés." />
        <Button onClick={() => setOpenNew(true)}>
          <Plus className="mr-1.5 size-4" /> Új cég
        </Button>
      </div>

      <div className="card-surface mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Keresés cégnév vagy domain szerint…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Státusz" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Minden státusz</SelectItem>
            <SelectItem value="nincs_valasz">Nincs válasz</SelectItem>
            <SelectItem value="valaszolt">Válaszolt</SelectItem>
            <SelectItem value="erdeklodik">Érdeklődik</SelectItem>
            <SelectItem value="lezarva">Lezárva</SelectItem>
          </SelectContent>
        </Select>
        <Select value={industryFilter} onValueChange={setIndustryFilter}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Iparág" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Minden iparág</SelectItem>
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
              ? "Nincs a szűrésnek megfelelő cég."
              : "Még egy cég sincs felvéve."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Vedd fel az első céget az „Új cég” gombbal.
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
                          .join(" · ") || "Nincs megadva iparág vagy város"}
                      </p>
                      <p className="mt-2 truncate text-xs text-muted-foreground">
                        {info?.contactName
                          ? `${info.contactName}${info.contactEmail ? ` — ${info.contactEmail}` : ""}`
                          : "Nincs kapcsolattartó"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${badge.pill}`}
                      >
                        <span className={`size-1.5 rounded-full ${badge.dot}`} />
                        {badge.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {info?.lastActivity
                          ? `Utolsó aktivitás: ${formatDate(info.lastActivity)}`
                          : "Nincs aktivitás"}
                      </span>
                      {company.opt_out && (
                        <span className="text-xs font-medium text-rose-600">Leiratkozott</span>
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
            <DialogTitle>Új cég</DialogTitle>
            <DialogDescription>Vedd fel kézzel a cég alapadatait.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="n-name">Cégnév</Label>
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
              <Label htmlFor="n-industry">Iparág</Label>
              <Input
                id="n-industry"
                value={form.industry}
                onChange={(event) => setForm({ ...form, industry: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-city">Város</Label>
              <Input
                id="n-city"
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="n-notes">Megjegyzések</Label>
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
              Mégse
            </Button>
            <Button
              onClick={() => createCompany.mutate()}
              disabled={!form.name.trim() || createCompany.isPending}
            >
              Cég mentése
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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
